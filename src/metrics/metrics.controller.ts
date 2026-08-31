import { Controller, Get } from '@nestjs/common';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@AdminOnly()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('summary')
  getSummary() {
    return this.metricsService.getSummary();
  }
}
