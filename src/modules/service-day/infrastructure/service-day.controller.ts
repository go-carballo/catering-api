import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Res,
  Header,
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ServiceDayService } from '../application/service-day.service';
import {
  ConfirmExpectedQuantityUseCase,
  ConfirmExpectedQuantityError,
  ConfirmServedQuantityUseCase,
  ConfirmServedQuantityError,
} from '../application/use-cases';
import {
  ConfirmExpectedDto,
  ConfirmServedDto,
  GenerateServiceDaysDto,
  DateRangeQueryDto,
  WeekStartQueryDto,
} from '../application/dto/service-day.dto';
import { GetCompany } from '../../../shared/decorators/get-company.decorator';
import { CompanyType } from '../../../shared/decorators/company-type.decorator';

@ApiTags('service-days')
@ApiBearerAuth()
@Controller()
export class ServiceDayController {
  constructor(
    private readonly serviceDayService: ServiceDayService,
    private readonly confirmExpectedQuantityUseCase: ConfirmExpectedQuantityUseCase,
    private readonly confirmServedQuantityUseCase: ConfirmServedQuantityUseCase,
  ) {}

  @Get('contracts/:contractId/service-days')
  @ApiOperation({
    summary: 'Get service days for a contract within date range',
  })
  @ApiParam({ name: 'contractId', description: 'Contract UUID' })
  findByContract(
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.serviceDayService.findByContractAndDateRange(
      contractId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  @Post('contracts/:contractId/service-days/generate')
  @ApiOperation({ summary: 'Generate service days for a contract' })
  @ApiParam({ name: 'contractId', description: 'Contract UUID' })
  @ApiResponse({ status: 201, description: 'Service days generated' })
  generateServiceDays(
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() dto: GenerateServiceDaysDto,
  ) {
    return this.serviceDayService.generateForContract(
      contractId,
      new Date(dto.fromDate),
      new Date(dto.toDate),
    );
  }

  @Post('service-days/:id/confirm-expected')
  @CompanyType('CLIENT')
  @ApiOperation({
    summary: 'Client confirms expected quantity for a service day',
    description: 'Only CLIENT companies can confirm expected quantities',
  })
  @ApiParam({ name: 'id', description: 'Service day UUID' })
  @ApiResponse({ status: 200, description: 'Expected quantity confirmed' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Not authorized (must be CLIENT)' })
  @ApiResponse({ status: 404, description: 'Service day not found' })
  async confirmExpected(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmExpectedDto,
    @GetCompany() company: { id: string },
  ) {
    const result = await this.confirmExpectedQuantityUseCase.execute({
      serviceDayId: id,
      expectedQuantity: dto.expectedQuantity,
      companyId: company.id,
    });

    if (!result.success) {
      throw this.mapErrorToHttpException(result.error);
    }

    return result.serviceDay;
  }

  private mapErrorToHttpException(
    error: ConfirmExpectedQuantityError,
  ): HttpException {
    switch (error.code) {
      case 'SERVICE_DAY_NOT_FOUND':
        return new NotFoundException(error.message);
      case 'NOT_AUTHORIZED':
        return new ForbiddenException(error.message);
      case 'CONTRACT_NOT_ACTIVE':
      case 'ALREADY_CONFIRMED':
      case 'NOTICE_PERIOD_EXCEEDED':
      case 'QUANTITY_OUT_OF_RANGE':
        return new BadRequestException(error.message);
      default:
        return new HttpException(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }

  @Post('service-days/:id/confirm-served')
  @CompanyType('CATERING')
  @ApiOperation({
    summary: 'Catering confirms served quantity for a service day',
    description: 'Only CATERING companies can confirm served quantities',
  })
  @ApiParam({ name: 'id', description: 'Service day UUID' })
  @ApiResponse({ status: 200, description: 'Served quantity confirmed' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Not authorized (must be CATERING)',
  })
  @ApiResponse({ status: 404, description: 'Service day not found' })
  async confirmServed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmServedDto,
    @GetCompany() company: { id: string },
  ) {
    const result = await this.confirmServedQuantityUseCase.execute({
      serviceDayId: id,
      servedQuantity: dto.servedQuantity,
      companyId: company.id,
    });

    if (!result.success) {
      throw this.mapServedErrorToHttpException(result.error);
    }

    return result.serviceDay;
  }

  private mapServedErrorToHttpException(
    error: ConfirmServedQuantityError,
  ): HttpException {
    switch (error.code) {
      case 'SERVICE_DAY_NOT_FOUND':
        return new NotFoundException(error.message);
      case 'NOT_AUTHORIZED':
        return new ForbiddenException(error.message);
      case 'CONTRACT_NOT_ACTIVE':
      case 'ALREADY_CONFIRMED':
      case 'INVALID_QUANTITY':
        return new BadRequestException(error.message);
      default:
        return new HttpException(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }

  @Get('contracts/:id/reports/weekly')
  @ApiOperation({ summary: 'Get weekly report for a contract' })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  getWeeklyReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WeekStartQueryDto,
    @GetCompany() company: { id: string },
  ) {
    return this.serviceDayService.getWeeklyReport(
      id,
      new Date(query.weekStart),
      company.id,
    );
  }

  @Get('contracts/:id/reports/weekly/csv')
  @ApiOperation({ summary: 'Export weekly report as CSV' })
  @ApiParam({ name: 'id', description: 'Contract UUID' })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'CSV file with weekly report',
    content: { 'text/csv': {} },
  })
  @Header('Content-Type', 'text/csv')
  async getWeeklyReportCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WeekStartQueryDto,
    @GetCompany() company: { id: string },
    @Res() res: Response,
  ) {
    const csv = await this.serviceDayService.getWeeklyReportCsv(
      id,
      new Date(query.weekStart),
      company.id,
    );

    const filename = `weekly-report-${id}-${query.weekStart}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
