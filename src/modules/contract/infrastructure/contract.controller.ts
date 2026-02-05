import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ContractService } from '../application/contract.service';
import { CreateContractDto } from '../application/dto/create-contract.dto';
import {
  GetCompany,
  type CurrentCompany,
} from '../../../shared/decorators/get-company.decorator';
import { CompanyType } from '../../../shared/decorators/company-type.decorator';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  @ApiOperation({
    summary: 'List contracts for the authenticated company',
    description:
      'Returns contracts where the company is either the client or catering provider',
  })
  findAll(@GetCompany() company: CurrentCompany) {
    if (company.companyType === 'CLIENT') {
      return this.contractService.findByClientId(company.id);
    }
    return this.contractService.findByCateringId(company.id);
  }

  @Get('finance-metrics')
  @CompanyType('CLIENT')
  @ApiOperation({
    summary: 'Get financial metrics for client company',
    description:
      'Returns budget, KPIs, and recent services for the authenticated client company. Only available for CLIENT type companies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Finance metrics retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Only CLIENT companies can access finance metrics',
  })
  getFinanceMetrics(@GetCompany() company: CurrentCompany) {
    return this.contractService.getFinanceMetrics(company.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contract by ID' })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({
    status: 403,
    description: 'Not authorized to view this contract',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCompany() company: CurrentCompany,
  ) {
    const contract = await this.contractService.findOne(id);

    // Verify the company is part of this contract
    const isOwner =
      contract.clientCompanyId === company.id ||
      contract.cateringCompanyId === company.id;

    if (!isOwner) {
      throw new ForbiddenException('Not authorized to view this contract');
    }

    return contract;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new contract between catering and client',
  })
  @ApiResponse({ status: 201, description: 'Contract created' })
  create(@Body() dto: CreateContractDto) {
    return this.contractService.create(dto);
  }

  @Post(':id/pause')
  @CompanyType('CLIENT')
  @ApiOperation({
    summary: 'Pause an active contract',
    description: 'Only the client company can pause the contract',
  })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({
    status: 403,
    description: 'Only CLIENT companies can pause contracts',
  })
  async pause(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCompany() company: CurrentCompany,
  ) {
    // Verify ownership before pausing
    const contract = await this.contractService.findOne(id);
    if (contract.clientCompanyId !== company.id) {
      throw new ForbiddenException(
        'Only the contract owner (client) can pause it',
      );
    }
    return this.contractService.pause(id);
  }

  @Post(':id/resume')
  @CompanyType('CLIENT')
  @ApiOperation({
    summary: 'Resume a paused contract',
    description: 'Only the client company can resume the contract',
  })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({
    status: 403,
    description: 'Only CLIENT companies can resume contracts',
  })
  async resume(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCompany() company: CurrentCompany,
  ) {
    // Verify ownership before resuming
    const contract = await this.contractService.findOne(id);
    if (contract.clientCompanyId !== company.id) {
      throw new ForbiddenException(
        'Only the contract owner (client) can resume it',
      );
    }
    return this.contractService.resume(id);
  }

  @Post(':id/terminate')
  @CompanyType('CLIENT')
  @ApiOperation({
    summary: 'Terminate a contract permanently',
    description: 'Only the client company can terminate the contract',
  })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiResponse({
    status: 403,
    description: 'Only CLIENT companies can terminate contracts',
  })
  async terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCompany() company: CurrentCompany,
  ) {
    // Verify ownership before terminating
    const contract = await this.contractService.findOne(id);
    if (contract.clientCompanyId !== company.id) {
      throw new ForbiddenException(
        'Only the contract owner (client) can terminate it',
      );
    }
    return this.contractService.terminate(id);
  }
}
