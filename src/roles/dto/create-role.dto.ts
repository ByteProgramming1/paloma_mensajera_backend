import { ArrayNotEmpty, IsArray, IsString, Matches, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'slug debe contener solo minusculas, numeros, guiones y guiones bajos',
  })
  slug: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionSlugs: string[];
}
