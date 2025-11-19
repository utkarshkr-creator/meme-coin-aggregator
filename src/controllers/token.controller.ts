import { Request, Response, NextFunction } from 'express';
import { TokenDataService } from '../services/tokenData.service';
import { AppError } from '../middlewares/errorHandler';

export class TokenController {
  private tokenDataService: TokenDataService;

  constructor() {
    this.tokenDataService = TokenDataService.getInstance();
  }

  public getTokens = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.tokenDataService.getTokens({
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        cursor: req.query.cursor as string,
        sortBy: req.query.sortBy as any,
        period: req.query.period as any,
        minVolume: req.query.minVolume ? parseFloat(req.query.minVolume as string) : undefined,
        minLiquidity: req.query.minLiquidity ? parseFloat(req.query.minLiquidity as string) : undefined,
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  public getTokenByAddress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { address } = req.params;
      
      if (!address) {
        throw new AppError(400, 'Token address is required');
      }

      const token = await this.tokenDataService.getTokenByAddress(address);
      
      if (!token) {
        throw new AppError(404, 'Token not found');
      }

      res.json({
        success: true,
        data: token,
      });
    } catch (error) {
      next(error);
    }
  };

  public searchTokens = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = req.params;
      
      if (!query || query.length < 2) {
        throw new AppError(400, 'Search query must be at least 2 characters');
      }

      const tokens = await this.tokenDataService.searchTokens(query);

      res.json({
        success: true,
        data: tokens,
        meta: {
          query,
          count: tokens.length,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}