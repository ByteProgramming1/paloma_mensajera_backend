import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Almacenamiento de imagenes del catalogo (seccion 9 del SDD): esta es la
// "alternativa mas simple" que el SDD explicitamente valida para el plazo del
// proyecto - una carpeta de archivos estaticos servida por el propio backend
// (ver app.useStaticAssets en main.ts) - en vez de un bucket S3-compatible.
// IMAGE_STORAGE_PROVIDER=S3_COMPATIBLE queda declarado en .env para cuando el
// equipo tenga un bucket real, pero no se implementa aqui todavia.
@Injectable()
export class ImageStorageService {
  constructor(private readonly configService: ConfigService) {}

  private assertValidFile(file: Express.Multer.File) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido: ${file.mimetype}. Usa JPEG, PNG o WebP.`,
      );
    }

    const maxSizeBytes = this.configService.get<number>('IMAGE_MAX_SIZE_MB')! * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `El archivo supera el tamano maximo permitido (${this.configService.get('IMAGE_MAX_SIZE_MB')}MB).`,
      );
    }
  }

  async saveProductImage(productId: string, file: Express.Multer.File): Promise<string> {
    this.assertValidFile(file);

    const provider = this.configService.get<string>('IMAGE_STORAGE_PROVIDER');
    if (provider !== 'LOCAL_FILESYSTEM') {
      throw new BadRequestException(
        `IMAGE_STORAGE_PROVIDER=${provider} no esta implementado todavia.`,
      );
    }

    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileName = `${Date.now()}-${sanitizedName}`;
    const productDir = join(process.cwd(), 'uploads', 'products', productId);

    await mkdir(productDir, { recursive: true });
    await writeFile(join(productDir, fileName), file.buffer);

    return `/uploads/products/${productId}/${fileName}`;
  }
}
