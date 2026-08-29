import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

// class-transformer's @Type(() => Boolean) does a plain Boolean(value)
// coercion. Applied to a query string, Boolean("false") is true — any
// non-empty string is truthy in JS, including the literal text "false". This
// decorator parses the "true"/"false" strings a query param actually sends
// instead, and validates whatever's left so a garbage value 400s rather than
// silently becoming true.
export function ParseOptionalBoolean(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) => {
      if (value === 'true') return true;
      if (value === 'false') return false;

      return value;
    }),
    IsBoolean(),
  );
}
