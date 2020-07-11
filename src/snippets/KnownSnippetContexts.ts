// ----------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.  All rights reserved.
// ----------------------------------------------------------------------------

export type SnippetContext = KnownSnippetContexts | string;

export enum KnownSnippetContexts {
    // No top-level JSON in the file
    empty = 'empty',

    resources = 'resources',
    parameterValues = 'parameterValues'
}
