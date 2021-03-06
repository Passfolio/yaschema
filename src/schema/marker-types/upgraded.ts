import { getAsyncTimeComplexityThreshold } from '../../config/async-time-complexity-threshold';
import { getLogger } from '../../config/logging';
import type { Schema } from '../../types/schema';
import { noError } from '../internal/consts';
import { makeInternalSchema } from '../internal/internal-schema-maker';
import type { CommonSchemaOptions } from '../internal/types/common-schema-options';
import type { InternalSchemaFunctions } from '../internal/types/internal-schema-functions';
import type { InternalAsyncValidator, InternalValidator } from '../internal/types/internal-validation';

const alreadyLogUpgradedWarnings = new Set<string>();

/** Requires either and old schema or a new schema be satisfied. */
export interface UpgradedSchema<OldT, NewT> extends Schema<OldT | NewT> {
  schemaType: 'upgraded';
  oldSchema: Schema<OldT>;
  newSchema: Schema<NewT>;
  deadline?: string;
}

/**
 * Requires either and old schema or a new schema be satisfied.  However, a warning is logged if the new schema isn't satisfied and the old
 * schema is (once per `uniqueName` per runtime instance).
 *
 * @see `setLogger`
 */
export const upgraded = <OldT, NewT>(
  uniqueName: string,
  args: { old: Schema<OldT>; new: Schema<NewT> },
  { deadline, ...options }: { deadline?: string } & CommonSchemaOptions = {}
): UpgradedSchema<OldT, NewT> => {
  const internalValidate: InternalValidator = (value, validatorOptions, path) => {
    const newResult = (args.new as any as InternalSchemaFunctions).internalValidate(value, validatorOptions, path);
    if (newResult.error === undefined) {
      return noError;
    }

    const oldResult = (args.old as any as InternalSchemaFunctions).internalValidate(value, validatorOptions, path);
    if (oldResult.error === undefined) {
      if (value !== undefined && !alreadyLogUpgradedWarnings.has(uniqueName)) {
        alreadyLogUpgradedWarnings.add(uniqueName);
        getLogger().warn?.(
          `[DEPRECATION] The schema for ${uniqueName} has been upgraded and legacy support will be removed ${
            deadline ? `after ${deadline}` : 'soon'
          }.`,
          'debug'
        );
      }

      return noError;
    } else {
      return oldResult;
    }
  };
  const internalValidateAsync: InternalAsyncValidator = async (value, validatorOptions, path) => {
    const asyncTimeComplexityThreshold = getAsyncTimeComplexityThreshold();

    const newResult =
      args.new.estimatedValidationTimeComplexity > asyncTimeComplexityThreshold
        ? await (args.new as any as InternalSchemaFunctions).internalValidateAsync(value, validatorOptions, path)
        : (args.new as any as InternalSchemaFunctions).internalValidate(value, validatorOptions, path);
    if (newResult.error === undefined) {
      return noError;
    }

    const oldResult =
      args.old.estimatedValidationTimeComplexity > asyncTimeComplexityThreshold
        ? await (args.old as any as InternalSchemaFunctions).internalValidateAsync(value, validatorOptions, path)
        : (args.old as any as InternalSchemaFunctions).internalValidate(value, validatorOptions, path);
    if (oldResult.error === undefined) {
      if (value !== undefined && !alreadyLogUpgradedWarnings.has(uniqueName)) {
        alreadyLogUpgradedWarnings.add(uniqueName);
        getLogger().warn?.(
          `[DEPRECATION] The schema for ${uniqueName} has been upgraded and legacy support will be removed ${
            deadline ? `after ${deadline}` : 'soon'
          }.`,
          'debug'
        );
      }

      return noError;
    } else {
      return oldResult;
    }
  };

  return makeInternalSchema(
    {
      valueType: undefined as any as OldT | NewT,
      schemaType: 'upgraded',
      oldSchema: args.old,
      newSchema: args.new,
      deadline,
      ...options,
      estimatedValidationTimeComplexity: args.old.estimatedValidationTimeComplexity + args.new.estimatedValidationTimeComplexity,
      usesCustomSerDes: args.old.usesCustomSerDes || args.new.usesCustomSerDes
    },
    { internalValidate, internalValidateAsync }
  );
};
