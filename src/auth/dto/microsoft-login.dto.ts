import { IsString, MinLength } from 'class-validator';

export class MicrosoftLoginDto {
  // id_token obtenido por el frontend al iniciar sesion con MSAL contra Entra ID.
  @IsString()
  @MinLength(1)
  idToken: string;
}
