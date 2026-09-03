import { Injectable } from '@nestjs/common';
import { ModerationMethod } from '../common/enums/domain.enums';
import { PROHIBITED_WORDS } from './prohibited-words';
import { normalizeText } from './text-normalizer';

export interface MessageModerationResult {
  approved: boolean;
  reason?: string;
  method: ModerationMethod;
}

// Moderacion automatica de la dedicatoria, sin intervencion humana - ver seccion 3.2 del SDD.
@Injectable()
export class ModerationService {
  async moderateMessage(letterContent: string): Promise<MessageModerationResult> {
    const normalized = normalizeText(letterContent);
    const flagged = PROHIBITED_WORDS.some((word) => normalized.includes(normalizeText(word)));

    if (flagged) {
      return {
        approved: false,
        reason: 'El mensaje contiene lenguaje inapropiado. Por favor editalo.',
        method: ModerationMethod.KEYWORD_FILTER,
      };
    }

    return { approved: true, method: ModerationMethod.KEYWORD_FILTER };
  }
}
