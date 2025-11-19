import { Router } from 'express';
import { TokenController } from '../controllers/token.controller';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = Router();
const controller = new TokenController();

// Apply rate limiting to all routes
router.use(apiLimiter);

// Get token list with filters
router.get('/', controller.getTokens);

// Get single token by address
router.get('/:address', controller.getTokenByAddress);

// Search tokens
router.get('/search/:query', controller.searchTokens);

export default router;
