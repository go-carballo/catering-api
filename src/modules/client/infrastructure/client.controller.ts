import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClientService } from '../application/client.service';
import { CreateClientDto } from '../application/dto/create-client.dto';
import { UpdateClientDto } from '../application/dto/update-client.dto';
import { Public } from '../../../shared/decorators/public.decorator';

@ApiTags('clients')
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all client companies' })
  findAll() {
    return this.clientService.findAll();
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a client company by ID' })
  @ApiParam({ name: 'id', description: 'Client company UUID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientService.findOne(id);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Register a new client company' })
  @ApiResponse({ status: 201, description: 'Client company created' })
  create(@Body() dto: CreateClientDto) {
    return this.clientService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a client company' })
  @ApiParam({ name: 'id', description: 'Client company UUID' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clientService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a client company (soft delete)' })
  @ApiParam({ name: 'id', description: 'Client company UUID' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientService.softDelete(id);
  }
}
