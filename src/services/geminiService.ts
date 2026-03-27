import { GoogleGenAI, Type } from "@google/genai";
import { Product, Sale, Branch, User, BusinessUnit } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const getBusinessInsights = async (
  prompt: string,
  context: {
    products: Product[];
    sales: Sale[];
    branches: Branch[];
    staff: User[];
    businessUnit: BusinessUnit | null;
  }
) => {
  const model = "gemini-3-flash-preview";
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todaySales = context.sales.filter(s => s.timestamp.startsWith(todayStr));
  
  const summary = {
    businessName: context.businessUnit?.name || "The Business",
    today: {
      salesCount: todaySales.length,
      revenue: todaySales.reduce((sum, s) => sum + s.total, 0),
      paymentMethods: todaySales.reduce((acc, s) => {
        acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    overall: {
      totalProducts: context.products.length,
      totalSalesCount: context.sales.length,
      totalRevenue: context.sales.reduce((sum, s) => sum + s.total, 0),
    },
    inventory: {
      lowStockCount: context.products.filter(p => p.stockLevel <= p.reorderPoint).length,
      lowStockItems: context.products
        .filter(p => p.stockLevel <= p.reorderPoint)
        .slice(0, 5)
        .map(p => ({ name: p.name, stock: p.stockLevel, reorder: p.reorderPoint })),
      expiringSoonCount: context.products.filter(p => {
        const expiry = new Date(p.expiryDate);
        const diff = expiry.getTime() - now.getTime();
        return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000);
      }).length,
      expiringSoonItems: context.products
        .filter(p => {
          const expiry = new Date(p.expiryDate);
          const diff = expiry.getTime() - now.getTime();
          return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000);
        })
        .slice(0, 5)
        .map(p => ({ name: p.name, expiry: p.expiryDate })),
    },
    topSellingProducts: getTopSelling(context.sales),
    branchesCount: context.branches.length,
    staffCount: context.staff.length,
  };

  const systemInstruction = `You are an expert Business Intelligence Assistant for a POS and Inventory Management system.
  
  CRITICAL RULE: ONLY use the data provided in the "Current Business Context" below. 
  DO NOT hallucinate numbers, percentages, or trends that are not explicitly in the data.
  If the data shows 0 sales, say there are 0 sales. 
  If you don't have comparison data (like "yesterday's sales"), DO NOT make up a comparison percentage.
  
  Current Business Context:
  ${JSON.stringify(summary, null, 2)}
  
  Guidelines:
  1. Be professional, concise, and strictly factual.
  2. Use GH₵ for all currency mentions.
  3. If the user asks for "today's" performance, look at the "today" section in the context.
  4. If the user asks to navigate, suggest the module (Dashboard, POS, Inventory, Catalog, Staff, Branches, Reports).
  5. Proactively warn about low stock or expiring products ONLY if the data shows they exist.
  6. Keep responses in Markdown format.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I'm sorry, I'm having trouble connecting to my brain right now. Please try again later.";
  }
};

function getTopSelling(sales: Sale[]) {
  const counts: Record<string, { name: string, qty: number }> = {};
  sales.forEach(s => {
    s.items.forEach(item => {
      if (!counts[item.productId]) {
        counts[item.productId] = { name: item.name, qty: 0 };
      }
      counts[item.productId].qty += item.quantity;
    });
  });
  return Object.values(counts)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);
}
