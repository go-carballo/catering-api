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
import { CateringService } from '../application/catering.service';
import { CreateCateringDto } from '../application/dto/create-catering.dto';
import { UpdateCateringDto } from '../application/dto/update-catering.dto';
import { Public } from '../../../shared/decorators/public.decorator';

@ApiTags('caterings')
@Controller('caterings')
export class CateringController {
  constructor(private readonly cateringService: CateringService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all catering companies' })
  findAll() {
    return this.cateringService.findAll();
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a catering company by ID' })
  @ApiParam({ name: 'id', description: 'Catering company UUID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cateringService.findOne(id);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Register a new catering company' })
  @ApiResponse({ status: 201, description: 'Catering company created' })
  create(@Body() dto: CreateCateringDto) {
    return this.cateringService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a catering company' })
  @ApiParam({ name: 'id', description: 'Catering company UUID' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCateringDto,
  ) {
    return this.cateringService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a catering company (soft delete)' })
  @ApiParam({ name: 'id', description: 'Catering company UUID' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.cateringService.softDelete(id);
  }
}
