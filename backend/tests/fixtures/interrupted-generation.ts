// Child-process fixture: pause only after the first section has committed.
import { aiService } from '../../src/services/ai/aiService.js';
import { generationService } from '../../src/services/generation/generationService.js';
const original = aiService.writeSection;
let calls = 0;
aiService.writeSection = async input => {
  if (++calls === 2) {
    setInterval(() => undefined, 1000); // Keep the fixture alive until the test kills it.
    process.send?.({ checkpointCommitted: true });
    await new Promise(() => undefined);
  }
  return original(input);
};
await generationService.process(process.argv[2]);
