import { z } from 'zod';

export const propertySchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  city: z.string().min(2),
  locality: z.string().min(2),
  price: z.number().int().positive(),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  areaSqFt: z.number().int().positive(),
  propertyType: z.string().min(2),
  listingType: z.enum(['SALE', 'RENT']).default('SALE'),
  amenities: z.array(z.string()).default([]),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

export const searchSchema = z.object({
  query: z.string().max(500).default(''),
  city: z.string().optional(),
  locality: z.string().optional(),
  maxPrice: z.number().int().positive().optional(),
  bedrooms: z.number().int().min(0).optional(),
  amenities: z.array(z.string()).default([]),
});
