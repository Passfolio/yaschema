import { getAsyncTimeComplexityThreshold } from '../../config/async-time-complexity-threshold';
import { getMeaningfulTypeof } from '../../type-utils/get-meaningful-typeof';
import type { Schema } from '../../types/schema';
import { noError } from '../internal/consts';
import { makeInternalSchema } from '../internal/internal-schema-maker';
import type { CommonSchemaOptions } from '../internal/types/common-schema-options';
import type { InternalSchemaFunctions } from '../internal/types/internal-schema-functions';
import type {
  InternalAsyncValidator,
  InternalValidationOptions,
  InternalValidationResult,
  InternalValidator
} from '../internal/types/internal-validation';
import { appendPathIndex, atPath } from '../internal/utils/path-utils';

const ESTIMATED_AVG_ARRAY_LENGTH = 100;

/** Requires an array. */
export interface ArraySchema<ItemT = any> extends Schema<ItemT[]> {
  schemaType: 'array';
  items?: Schema<ItemT>;
  minLength?: number;
  maxLength?: number;
  /**
   * If specified, only the first maxEntriesToValidate entries are validated -- applies to item validation but not pattern validation.
   * This is ignored if the items require custom serialization or deserialization
   */
  maxEntriesToValidate?: number;
}

/**
 * Requires an array.  Element validation is optional.
 *
 * Because validation of very long arrays can be prohibitively expensive in some cases, one may use the `maxEntriesToValidate` option to
 * limit the limit that are actually validated.  Note however, that `maxEntriesToValidate` is ignored if needed transformation is required
 * within the array elements, for example with an array of dates where the dates need to be serialized or deserialized.
 */
export const array = <ItemT = any>(
  options: {
    items?: Schema<ItemT>;
    minLength?: number;
    maxLength?: number;
    maxEntriesToValidate?: number;
  } & CommonSchemaOptions = {}
): ArraySchema<ItemT> => {
  const needsDeepSerDes = options.items?.usesCustomSerDes ?? false;

  const internalValidate: InternalValidator = (value, validatorOptions, path) =>
    validateArray(value, { ...options, needsDeepSerDes, path, validatorOptions });
  const internalValidateAsync: InternalAsyncValidator = async (value, validatorOptions, path) =>
    asyncValidateArray(value, { ...options, needsDeepSerDes, path, validatorOptions });

  return makeInternalSchema(
    {
      valueType: undefined as any as ItemT[],
      schemaType: 'array',
      ...options,
      estimatedValidationTimeComplexity:
        (options.items?.estimatedValidationTimeComplexity ?? 1) *
        ((needsDeepSerDes ? options.maxLength : options.maxEntriesToValidate) ?? ESTIMATED_AVG_ARRAY_LENGTH),
      usesCustomSerDes: needsDeepSerDes
    },
    { internalValidate, internalValidateAsync }
  );
};

// Helpers

/**
 * Requires an array, optionally with items matching the specified schema, and/or a min and/or max
 * length
 */
const validateArray = <ItemT>(
  value: any,
  {
    items,
    minLength = 0,
    maxLength,
    maxEntriesToValidate,
    needsDeepSerDes,
    path,
    validatorOptions
  }: {
    items?: Schema<ItemT>;
    minLength?: number;
    maxLength?: number;
    /** If specified, only the first maxEntriesToValidate entries are validated -- applies to item validation but not pattern validation */
    maxEntriesToValidate?: number;
    needsDeepSerDes: boolean;
    path: string;
    validatorOptions: InternalValidationOptions;
  }
) => {
  const shouldStopOnFirstError = validatorOptions.validation === 'hard' || !needsDeepSerDes;

  if (!Array.isArray(value)) {
    return { error: () => `Expected array, found ${getMeaningfulTypeof(value)}${atPath(path)}` };
  }

  if (!needsDeepSerDes && validatorOptions.validation === 'none') {
    return noError;
  }

  let errorResult: InternalValidationResult | undefined;

  if (errorResult === undefined && value.length < minLength) {
    errorResult = {
      error: () => `Expected an array with at least ${minLength} element(s), found an array with ${value.length} element(s)${atPath(path)}`
    };

    if (shouldStopOnFirstError) {
      return errorResult;
    }
  }

  if (errorResult === undefined && maxLength !== undefined && value.length > maxLength) {
    errorResult = {
      error: () => `Expected an array with at most ${maxLength} element(s), found an array with ${value.length} element(s)${atPath(path)}`
    };

    if (shouldStopOnFirstError) {
      return errorResult;
    }
  }

  if (items !== undefined) {
    let index = 0;
    for (const arrayItem of value) {
      if (!needsDeepSerDes && maxEntriesToValidate !== undefined && index >= maxEntriesToValidate) {
        break; // Reached the max number to validate
      }

      const result = (items as any as InternalSchemaFunctions).internalValidate(arrayItem, validatorOptions, appendPathIndex(path, index));
      if (errorResult === undefined && result.error !== undefined) {
        errorResult = result;

        if (shouldStopOnFirstError) {
          return errorResult;
        }
      }
      index += 1;
    }
  }

  return errorResult ?? noError;
};

/**
 * Requires an array, optionally with items matching the specified schema, and/or a min and/or max
 * length
 */
const asyncValidateArray = async <ItemT>(
  value: any,
  {
    items,
    minLength = 0,
    maxLength,
    maxEntriesToValidate,
    needsDeepSerDes,
    path,
    validatorOptions
  }: {
    items?: Schema<ItemT>;
    minLength?: number;
    maxLength?: number;
    /** If specified, only the first maxEntriesToValidate entries are validated -- applies to item validation but not pattern validation */
    maxEntriesToValidate?: number;
    needsDeepSerDes: boolean;
    path: string;
    validatorOptions: InternalValidationOptions;
  }
) => {
  const shouldStopOnFirstError = validatorOptions.validation === 'hard' || !needsDeepSerDes;

  if (!Array.isArray(value)) {
    return { error: () => `Expected array, found ${getMeaningfulTypeof(value)}${atPath(path)}` };
  }

  if (!needsDeepSerDes && validatorOptions.validation === 'none') {
    return noError;
  }

  let errorResult: InternalValidationResult | undefined;

  if (validatorOptions.validation !== 'none') {
    if (errorResult === undefined && value.length < minLength) {
      errorResult = {
        error: () =>
          `Expected an array with at least ${minLength} element(s), found an array with ${value.length} element(s)${atPath(path)}`
      };

      if (shouldStopOnFirstError) {
        return errorResult;
      }
    }

    if (errorResult === undefined && maxLength !== undefined && value.length > maxLength) {
      errorResult = {
        error: () => `Expected an array with at most ${maxLength} element(s), found an array with ${value.length} element(s)${atPath(path)}`
      };

      if (shouldStopOnFirstError) {
        return errorResult;
      }
    }
  }

  if (items === undefined) {
    return errorResult ?? noError;
  }

  const asyncTimeComplexityThreshold = getAsyncTimeComplexityThreshold();
  const chunkSize = Math.max(1, Math.floor(asyncTimeComplexityThreshold / items.estimatedValidationTimeComplexity));
  const numValues = value.length;

  const processChunk = async (chunkStartIndex: number) => {
    if (validatorOptions.shouldYield()) {
      await validatorOptions.yield();
    }

    for (let index = chunkStartIndex; index < numValues && index < chunkStartIndex + chunkSize; index += 1) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const arrayItem = value[index];

      if (!needsDeepSerDes && maxEntriesToValidate !== undefined && index >= maxEntriesToValidate) {
        return false; // Reached the max number to validate
      }

      const result =
        items.estimatedValidationTimeComplexity > asyncTimeComplexityThreshold
          ? await (items as any as InternalSchemaFunctions).internalValidateAsync(arrayItem, validatorOptions, appendPathIndex(path, index))
          : (items as any as InternalSchemaFunctions).internalValidate(arrayItem, validatorOptions, appendPathIndex(path, index));
      if (errorResult === undefined && result.error !== undefined) {
        errorResult = result;

        if (shouldStopOnFirstError) {
          return errorResult;
        }
      }
    }

    return undefined;
  };

  for (let chunkStartIndex = 0; chunkStartIndex < numValues; chunkStartIndex += chunkSize) {
    const chunkRes = await processChunk(chunkStartIndex);
    if (chunkRes === false) {
      break; // Reached the max number to validate
    } else if (chunkRes !== undefined) {
      chunkRes;
    }
  }

  return errorResult ?? noError;
};
