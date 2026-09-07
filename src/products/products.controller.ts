import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permissions } from '../common/enums/permissions';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateAddOnGroupDto } from './dto/create-addon-group.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions(Permissions.PRODUCTS_READ_ACTIVE)
  @Get()
  findActive() {
    return this.productsService.findActive();
  }

  @RequirePermissions(Permissions.PRODUCTS_MANAGE)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @RequirePermissions(Permissions.PRODUCTS_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  // Sube la imagen al almacenamiento configurado y actualiza imageUrl
  // (seccion 9 del SDD) - memoryStorage: el archivo nunca toca disco antes de
  // pasar por la validacion de tipo/tamano en ImageStorageService.
  @RequirePermissions(Permissions.PRODUCTS_MANAGE)
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.productsService.updateImage(id, file);
  }

  // Crea un grupo de acompañantes para el producto (ej. "Elige tu carta").
  // Las opciones del grupo se crean por separado, ver POST /add-on-options.
  @RequirePermissions(Permissions.PRODUCTS_MANAGE)
  @Post(':id/addon-groups')
  createAddOnGroup(@Param('id') id: string, @Body() dto: CreateAddOnGroupDto) {
    return this.productsService.createAddOnGroup(id, dto);
  }
}
