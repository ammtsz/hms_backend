import { Transform } from 'class-transformer';
import * as sanitizeHtml from 'sanitize-html';

/**
 * Sanitize decorator to prevent XSS attacks
 * Removes all HTML tags and dangerous content from string inputs
 * 
 * @example
 * ```typescript
 * export class CreatePatientDto {
 *   @Sanitize()
 *   @IsString()
 *   @IsNotEmpty()
 *   name: string;
 * }
 * ```
 */
export function Sanitize() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;

    // First pass: remove all HTML tags but preserve entities
    const withoutTags = sanitizeHtml(value, {
      allowedTags: [], // No HTML tags allowed
      allowedAttributes: {},
      disallowedTagsMode: 'discard', // Remove tags completely
      parser: {
        decodeEntities: false, // Don't decode HTML entities during parsing
      },
    });

    // Second pass: decode any HTML entities that were created
    const decoded = withoutTags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');

    return decoded.trim();
  });
}
