import {
  pgTable,
  pgEnum,
  uuid,
  decimal,
  integer,
  boolean,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { applications } from './applications';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const riskLevelEnum = pgEnum('risk_level', [
  'low',
  'medium',
  'high',
]);

export const riskRecommendationEnum = pgEnum('risk_recommendation', [
  'approve',
  'decline',
  'manual_review',
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const riskAssessments = pgTable('risk_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Relationship — many assessments can exist per application
  // One-to-many: tenant may reapply after job change, income update, etc.
  // RESTRICT: assessment records must not be orphaned
  application_id: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'restrict' }),

  // Tracks which assessment is current for this application
  // When a new assessment is created, previous ones are flipped to false
  // Avoids ORDER BY created_at DESC on every query
  is_latest: boolean('is_latest').notNull().default(true),

  // Income snapshot at time of assessment — immutable audit record
  // Not a FK to tenant_profiles: captures what was true at decision time
  monthly_income: decimal('monthly_income', { precision: 15, scale: 2 }).notNull(),

  // Rent-to-income ratio — e.g. 0.33 = 33%
  // Nigerian standard: should not exceed 33% of monthly income
  rent_to_income_ratio: decimal('rent_to_income_ratio', { precision: 5, scale: 2 }).notNull(),

  // Employer verification result
  employer_verified: boolean('employer_verified').notNull().default(false),

  // Credit score — Nigerian credit bureau scale: 0–850
  // 0–299: Poor | 300–579: Fair | 580–699: Good | 700–850: Excellent
  credit_score: integer('credit_score').notNull(),

  // Internal affordability score — 0–100
  // Calculated by the risk engine based on income, ratio, and credit score
  affordability_score: integer('affordability_score').notNull(),

  // Risk classification and recommendation
  risk_level: riskLevelEnum('risk_level').notNull(),
  recommendation: riskRecommendationEnum('recommendation').notNull(),

  // Optional notes from admin or system
  notes: text('notes'),

  // No updated_at — risk assessments are immutable once written
  // A new record is created for every re-assessment
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskAssessment = typeof riskAssessments.$inferSelect;
export type NewRiskAssessment = typeof riskAssessments.$inferInsert;
