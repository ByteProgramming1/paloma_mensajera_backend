import { ModerationService } from './moderation.service';
import { ModerationMethod } from '../common/enums/domain.enums';

describe('ModerationService', () => {
  const service = new ModerationService();

  it('aprueba un mensaje sin lenguaje inapropiado', async () => {
    const result = await service.moderateMessage('Feliz cumpleanos, que la pases increible!');

    expect(result).toEqual({ approved: true, method: ModerationMethod.KEYWORD_FILTER });
  });

  it('rechaza un mensaje con una palabra prohibida', async () => {
    const result = await service.moderateMessage('Eres un idiota');

    expect(result.approved).toBe(false);
    expect(result.method).toBe(ModerationMethod.KEYWORD_FILTER);
    expect(result.reason).toBeDefined();
  });

  it('detecta la palabra prohibida sin importar tildes ni mayusculas', async () => {
    const result = await service.moderateMessage('ERES UN IDIOTA');

    expect(result.approved).toBe(false);
  });
});
