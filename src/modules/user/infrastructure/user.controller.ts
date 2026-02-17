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
import { UserService } from '../application/user.service';
import { CreateUserDto } from '../application/dto/create-user.dto';
import { UpdateUserDto } from '../application/dto/update-user.dto';
import {
  GetCompany,
  type CurrentCompany,
} from '../../../shared/decorators/get-company.decorator';
import { type User } from '../domain/user.entity';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List all users for the authenticated company' })
  async findAll(@GetCompany() company: CurrentCompany): Promise<User[]> {
    return this.userService.findAllByCompany(company.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCompany() company: CurrentCompany,
  ): Promise<User> {
    return this.userService.findOne(id, company.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  async create(
    @GetCompany() company: CurrentCompany,
    @Body() dto: CreateUserDto,
  ): Promise<User> {
    return this.userService.create(company.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCompany() company: CurrentCompany,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(id, company.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCompany() company: CurrentCompany,
  ): Promise<{ message: string }> {
    await this.userService.delete(id, company.id);
    return { message: 'User deleted successfully' };
  }
}
