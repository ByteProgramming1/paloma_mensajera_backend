import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permissions } from '../common/enums/permissions';
import { AddOnOptionsService } from './addon-options.service';
import { CreateAddOnOptionDto } from './dto/create-addon-option.dto';
import { UpdateAddOnOptionDto } from './dto/update-addon-option.dto';

// Catalogo de opciones de acompañante (ej. "Carta rosa", "Carta corazón"),
// agrupadas bajo un ProductAddOnGroup (ver POST /products/:id/addon-groups).
// Mismos permisos que el catalogo de productos: es parte de la gestion del
// catalogo, no un recurso separado con su propia matriz de permisos.
@Controller('add-on-options')
@RequirePermissions(Permissions.PRODUCTS_MANAGE)
export class AddOnOptionsController {
  constructor(private readonly addOnOptionsService: AddOnOptionsService) {}

  @Post()
  create(@Body() dto: CreateAddOnOptionDto) {
    return this.addOnOptionsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAddOnOptionDto) {
    return this.addOnOptionsService.update(id, dto);
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.addOnOptionsService.updateImage(id, file);
  }
}
