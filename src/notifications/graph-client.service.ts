import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Cliente de Microsoft Graph API para el modo automatico de notificacion por Teams
// (seccion 11.3 del SDD). La app registrada en Azure AD / Microsoft Entra ID de la
// universidad es una dependencia externa fuera del control del equipo de desarrollo;
// mientras esos permisos no esten otorgados, este cliente falla de forma controlada
// para que el llamador degrade a modo manual (ver TeamsNotificationService).
@Injectable()
export class GraphClientService {
  private readonly logger = new Logger(GraphClientService.name);

  constructor(private readonly configService: ConfigService) {}

  private isConfigured(): boolean {
    const requiredVars = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'];
    return requiredVars.every((key) => {
      const value = this.configService.get<string>(key);
      return !!value && value !== 'change_in_production';
    });
  }

  async sendChatMessage(userPrincipalName: string, _content: string): Promise<string> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `Microsoft Graph API no esta configurada (pendiente de TI institucional); no se puede notificar a ${userPrincipalName}.`,
      );
      throw new ServiceUnavailableException('Microsoft Graph API no esta configurada.');
    }

    // Integracion real pendiente de los permisos de aplicacion otorgados por TI
    // (ChatMessage.Send u equivalente) - ver seccion 11.3 del SDD.
    throw new ServiceUnavailableException(
      'Integracion con Microsoft Graph API pendiente de implementacion.',
    );
  }
}
