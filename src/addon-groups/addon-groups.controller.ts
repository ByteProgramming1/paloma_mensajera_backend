import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permissions } from '../common/enums/permissions';
import { AddOnGroupsService } from './addon-groups.service';
import { CreateAddOnGroupDto } from './dto/create-addon-group.dto';

// Catalogo reutilizable de grupos de acompañantes (ej. "Cartas"), creado una
// sola vez y asociado a cualquier cantidad de productos - ver
// POST/DELETE /products/:id/addon-groups/:groupId. Mismos permisos que el
// catalogo de productos: es parte de la gestion del catalogo.
@Controller('addon-groups')
@RequirePermissions(Permissions.PRODUCTS_MANAGE)
export class AddOnGroupsController {
  constructor(private readonly addOnGroupsService: AddOnGroupsService) {}

  @Post()
  create(@Body() dto: CreateAddOnGroupDto) {
    return this.addOnGroupsService.create(dto);
  }

  @Get()
  findAll() {
    return this.addOnGroupsService.findAll();
  }
}
