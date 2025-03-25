import { Global, Module } from '@nestjs/common';

import { SharedService } from './shared.service.js';

@Global()
@Module({
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule { }
