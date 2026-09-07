import {
  Body,
  Controller,
  Delete,
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

  // Asocia/desasocia un grupo de acompañantes YA EXISTENTE (ver
  // POST /addon-groups) al producto - el grupo y sus opciones se gestionan
  // aparte, como catalogo reutilizable entre varios productos.
  @RequirePermissions(Permissions.PRODUCTS_MANAGE)
  @Post(':id/addon-groups/:groupId')
  linkAddOnGroup(@Param('id') id: string, @Param('groupId') groupId: string) {
    return this.productsService.linkAddOnGroup(id, groupId);
  }

  @RequirePermissions(Permissions.PRODUCTS_MANAGE)
  @Delete(':id/addon-groups/:groupId')
  unlinkAddOnGroup(@Param('id') id: string, @Param('groupId') groupId: string) {
    return this.productsService.unlinkAddOnGroup(id, groupId);
  }
}
