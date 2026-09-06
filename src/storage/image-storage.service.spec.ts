import { BadRequestException } from '@nestjs/common';
import { BlobServiceClient } from '@azure/storage-blob';
import { ImageStorageService } from './image-storage.service';

// Mismo patron que raffle-numbers.service.spec.ts: el factory de jest.mock no
// puede cerrar sobre variables externas (Jest lo hoistea por encima de sus
// declaraciones), asi que el mock se crea vacio aqui y se configura despues,
// importando el modulo ya mockeado.
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: { fromConnectionString: jest.fn() },
}));

const fromConnectionString = BlobServiceClient.fromConnectionString as jest.Mock;

function buildFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: 'foto.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  } as Express.Multer.File;
}

function buildConfig(values: Record<string, unknown>) {
  return { get: jest.fn((key: string) => values[key]) };
}

describe('ImageStorageService', () => {
  afterEach(() => jest.clearAllMocks());

  it('rechaza un tipo de archivo no permitido', async () => {
    const service = new ImageStorageService(buildConfig({}) as never);

    await expect(
      service.saveProductImage('p1', buildFile({ mimetype: 'application/pdf' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un archivo que supera el tamano maximo', async () => {
    const service = new ImageStorageService(buildConfig({ IMAGE_MAX_SIZE_MB: 1 }) as never);

    await expect(
      service.saveProductImage('p1', buildFile({ size: 2 * 1024 * 1024 })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un provider no implementado', async () => {
    const service = new ImageStorageService(
      buildConfig({ IMAGE_MAX_SIZE_MB: 5, IMAGE_STORAGE_PROVIDER: 'S3_COMPATIBLE' }) as never,
    );

    await expect(service.saveProductImage('p1', buildFile())).rejects.toThrow(BadRequestException);
  });

  it('sube el archivo a Azure Blob Storage y devuelve la url del blob', async () => {
    const uploadData = jest.fn();
    const getBlockBlobClient = jest.fn(() => ({
      uploadData,
      url: 'https://paloma.blob.core.windows.net/products/p1/123-foto.jpg',
    }));
    const getContainerClient = jest.fn(() => ({ getBlockBlobClient }));
    fromConnectionString.mockReturnValue({ getContainerClient });

    const service = new ImageStorageService(
      buildConfig({
        IMAGE_MAX_SIZE_MB: 5,
        IMAGE_STORAGE_PROVIDER: 'AZURE_BLOB',
        AZURE_STORAGE_CONNECTION_STRING: 'fake-connection-string',
        AZURE_STORAGE_CONTAINER_NAME: 'products',
      }) as never,
    );

    const result = await service.saveProductImage('p1', buildFile());

    expect(fromConnectionString).toHaveBeenCalledWith('fake-connection-string');
    expect(getContainerClient).toHaveBeenCalledWith('products');
    expect(getBlockBlobClient).toHaveBeenCalledWith(
      expect.stringMatching(/^products\/p1\/\d+-foto\.jpg$/),
    );
    expect(uploadData).toHaveBeenCalledWith(expect.any(Buffer), {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });
    expect(result).toBe('https://paloma.blob.core.windows.net/products/p1/123-foto.jpg');
  });

  it('rechaza subir a Azure Blob si falta AZURE_STORAGE_CONNECTION_STRING', async () => {
    const service = new ImageStorageService(
      buildConfig({
        IMAGE_MAX_SIZE_MB: 5,
        IMAGE_STORAGE_PROVIDER: 'AZURE_BLOB',
        AZURE_STORAGE_CONTAINER_NAME: 'products',
      }) as never,
    );

    await expect(service.saveProductImage('p1', buildFile())).rejects.toThrow(BadRequestException);
  });
});
