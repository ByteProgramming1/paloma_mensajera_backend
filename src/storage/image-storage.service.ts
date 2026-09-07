import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Almacenamiento de imagenes del catalogo (seccion 9 del SDD). LOCAL_FILESYSTEM
// es la "alternativa mas simple" que el SDD explicitamente valida para el
// plazo del proyecto - una carpeta de archivos estaticos servida por el
// propio backend (ver app.useStaticAssets en main.ts). AZURE_BLOB sube al
// contenedor de Azure Blob Storage del equipo (el contenedor debe tener
// acceso publico de lectura a nivel "Blob" para que las imagenes se puedan
// mostrar directo en el catalogo). S3_COMPATIBLE queda declarado en .env
// para cuando el equipo tenga un bucket S3 real, pero no se implementa aqui.
@Injectable()
export class ImageStorageService {
  private blobServiceClient?: BlobServiceClient;

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
    return this.saveImage('products', productId, file);
  }

  async saveAddOnOptionImage(optionId: string, file: Express.Multer.File): Promise<string> {
    return this.saveImage('addon-options', optionId, file);
  }

  private async saveImage(
    category: string,
    entityId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    this.assertValidFile(file);

    const provider = this.configService.get<string>('IMAGE_STORAGE_PROVIDER');
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileName = `${Date.now()}-${sanitizedName}`;

    if (provider === 'AZURE_BLOB') {
      return this.saveToAzureBlob(category, entityId, fileName, file);
    }

    if (provider !== 'LOCAL_FILESYSTEM') {
      throw new BadRequestException(
        `IMAGE_STORAGE_PROVIDER=${provider} no esta implementado todavia.`,
      );
    }

    const entityDir = join(process.cwd(), 'uploads', category, entityId);
    await mkdir(entityDir, { recursive: true });
    await writeFile(join(entityDir, fileName), file.buffer);

    return `/uploads/${category}/${entityId}/${fileName}`;
  }

  private getBlobServiceClient(): BlobServiceClient {
    if (!this.blobServiceClient) {
      const connectionString = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING');
      if (!connectionString) {
        throw new BadRequestException(
          'AZURE_STORAGE_CONNECTION_STRING no esta configurado en el servidor.',
        );
      }
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    }
    return this.blobServiceClient;
  }

  private async saveToAzureBlob(
    category: string,
    entityId: string,
    fileName: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const containerName = this.configService.get<string>('AZURE_STORAGE_CONTAINER_NAME');
    if (!containerName) {
      throw new BadRequestException(
        'AZURE_STORAGE_CONTAINER_NAME no esta configurado en el servidor.',
      );
    }

    const containerClient = this.getBlobServiceClient().getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(
      `${category}/${entityId}/${fileName}`,
    );

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    return blockBlobClient.url;
  }
}
