import { tool } from 'ai';
import api from '@/axios/axiosInstance';
import axios from 'axios';
import { z } from 'zod';

const marketAnalysisSchema = z.object({
    symbol: z.string().describe('The symbol of token on Cardano blockchain (e.g., "USDM", "MIN" or any other token symbol)'),
});

export const marketAnalysisTool = tool({
    description: 'Get the daily market data for a given token',
    parameters: marketAnalysisSchema,
    execute: async function ({ symbol }) {
        console.log('----- Trigger market analysis -----');
        console.log({ symbol });
        
        try {
            const response = await api.get(`/market/daily?symbol=${symbol}&limit=10`);
            const data = await response.data;
            
            // Create a human-readable content message for the AI
            const content = `Market data for ${symbol} has been retrieved. Use this data and follow system prompt to provide analysis and insights.`;
            
            // console.log('marketAnalysisTool return: ', {
            //     success: true,
            //     content,
            //     dataPoints: Array.isArray(data) ? data.length : 'N/A',
            // });
            
            return {
                success: true,
                content,
                data,
            };
        } catch (error) {
            const content = `Unexpected error fetching market data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.log(content);
            return { 
                success: false, 
                content 
            };
        }
    },
});

const getSupportedTokensSchema = z.object({
    query: z.string().optional().describe('Optional search query to filter tokens by name or symbol'),
    page: z.number().optional().default(1).describe('Page number for pagination (default: 1)'),
    page_size: z.number().optional().default(50).describe('Number of tokens per page (default: 50)'),
});

export const getSupportedTokensTool = tool({
    description: 'Get the list of supported tokens on Seerbot Exchange. Use this to answer questions about what tokens are available on the platform.',
    parameters: getSupportedTokensSchema,
    execute: async function ({ query, page = 1, page_size = 50 }) {
        console.log('----- Trigger get supported tokens -----');
        console.log({ query, page, page_size });
        
        try {
            const params: Record<string, string | number> = {
                page,
                page_size,
            };
            
            if (query) {
                params.query = query;
            }
            
            const response = await api.get('/analysis/tokens', { params });
            const responseData = await response.data;
            
            // Extract only id, name, and symbol from each token
            const tokens = (responseData.tokens || []).map((token: any) => ({
                id: token.id || '',
                name: token.name || '',
                symbol: token.symbol || '',
            }));
            
            // Create a human-readable content message
            const totalTokens = responseData.total || 0;
            const currentPage = responseData.page || page;
            const tokensCount = tokens.length;
            
            let content = `Found ${totalTokens} supported token${totalTokens !== 1 ? 's' : ''} on Seerbot Exchange`;
            if (query) {
                content += ` matching "${query}"`;
            }
            content += `. Showing ${tokensCount} token${tokensCount !== 1 ? 's' : ''} on page ${currentPage}.`;
            content += ` Use this data and follow system prompt to inform users about available tokens on the platform.`;
            
            // console.log('getSupportedTokensTool return: ', {
            //     success: true,
            //     content,
            //     totalTokens,
            //     tokensCount,
            //     page: currentPage,
            // });
            
            return {
                success: true,
                content,
                data: {
                    total: totalTokens,
                    page: currentPage,
                    tokens,
                },
            };
        } catch (error) {
            const content = `Unexpected error fetching supported tokens: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.log(content);
            return { 
                success: false, 
                content 
            };
        }
    },
});

const adaAnalysisSchema = z.object({
    symbol: z.literal('ADA').describe('Analyze ADA token'),
    limit: z.number().optional().default(10).describe('Number of data points to retrieve (default: 10)'),
});

export const adaAnalysisTool = tool({
    description: 'Get the daily market data for ADA token from the Vistia API',
    parameters: adaAnalysisSchema,
    execute: async function ({ symbol, limit = 10 }) {
        console.log('----- Trigger ADA analysis -----');
        console.log({ symbol, limit });
        
        try {
            const baseURL = process.env.NEXT_VISTIA_API;
            
            if (!baseURL) {
                throw new Error('NEXT_VISTIA_API environment variable is not configured');
            }

            const url = `${baseURL}api/v2_2/market/daily?symbol=${symbol}&limit=${limit}`;
            
            const response = await axios.get(url);
            const data = await response.data;
            
            // Create a human-readable content message for the AI
            const content = `Market data for ${symbol} has been retrieved. Use this data and follow system prompt to provide analysis and insights.`;
            
            return {
                success: true,
                content,
                data,
            };
        } catch (error) {
            const content = `Unexpected error fetching market data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.log(content);
            return { 
                success: false, 
                content 
            };
        }
    },
});