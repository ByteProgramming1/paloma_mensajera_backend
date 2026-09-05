import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

export interface MicrosoftIdTokenClaims {
  microsoftId: string;
  email: string;
  name: string;
}

// Valida el id_token que el frontend obtiene al iniciar sesion con la cuenta
// institucional de Microsoft (Entra ID / Azure AD) via MSAL, comprobando su
// firma contra las claves publicas (JWKS) del tenant de la universidad. Esta
// app registration (SPA/publica, inicio de sesion delegado) es independiente
// de la usada por GraphClientService para enviar mensajes de Teams (app-only).
@Injectable()
export class MicrosoftAuthService {
  private jwksClient?: JwksClient;

  constructor(private readonly configService: ConfigService) {}

  private getConfigValue(key: 'AZURE_AD_TENANT_ID' | 'AZURE_AD_CLIENT_ID'): string | undefined {
    const value = this.configService.get<string>(key);
    return value && value !== 'change_in_production' ? value : undefined;
  }

  private getTenantId(): string | undefined {
    return this.getConfigValue('AZURE_AD_TENANT_ID');
  }

  private getClientId(): string | undefined {
    return this.getConfigValue('AZURE_AD_CLIENT_ID');
  }

  private getJwksClient(tenantId: string): JwksClient {
    if (!this.jwksClient) {
      this.jwksClient = new JwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        rateLimit: true,
      });
    }
    return this.jwksClient;
  }

  async validateIdToken(idToken: string): Promise<MicrosoftIdTokenClaims> {
    const tenantId = this.getTenantId();
    const clientId = this.getClientId();
    if (!tenantId || !clientId) {
      throw new ServiceUnavailableException(
        'El inicio de sesion con Microsoft no esta configurado en el servidor.',
      );
    }

    const decoded = jwt.decode(idToken, { complete: true });
    const kid = typeof decoded === 'object' ? decoded?.header.kid : undefined;
    if (!kid) {
      throw new UnauthorizedException('Token de Microsoft invalido.');
    }

    let publicKey: string;
    try {
      const signingKey = await this.getJwksClient(tenantId).getSigningKey(kid);
      publicKey = signingKey.getPublicKey();
    } catch {
      throw new UnauthorizedException('No fue posible validar el token de Microsoft.');
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(idToken, publicKey, {
        audience: clientId,
        issuer: [
          `https://login.microsoftonline.com/${tenantId}/v2.0`,
          `https://sts.windows.net/${tenantId}/`,
        ],
      }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Token de Microsoft invalido o expirado.');
    }

    const email = (payload.preferred_username ?? payload.email ?? payload.upn) as
      string | undefined;
    const microsoftId = payload.oid as string | undefined;
    const name = (payload.name as string | undefined) ?? email;

    if (!email || !microsoftId) {
      throw new UnauthorizedException('El token de Microsoft no incluye la informacion necesaria.');
    }

    return { microsoftId, email, name: name ?? email };
  }
}
