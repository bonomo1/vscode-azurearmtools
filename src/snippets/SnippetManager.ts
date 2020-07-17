/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as stripJsonComments from "strip-json-comments";
import { window } from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { CachedPromise } from '../CachedPromise';
import * as Completion from "../Completion";
import { assetsPath, extensionName } from '../constants';
import * as language from "../Language";
import { readUtf8FileWithBom } from '../util/readUtf8FileWithBom';
import { ISnippet, ISnippetManager } from "./ISnippetManager";
import { KnownSnippetContexts, SnippetContext } from "./KnownSnippetContexts";

interface ISnippetDefinitionFromFile {
    prefix: string; // e.g. "arm!"
    body: string[];
    description: string; // e.g. "Resource Group Template"
    context: string;
}

interface ISnippetInternal extends ISnippet {
    context: SnippetContext;
}

export class SnippetManager implements ISnippetManager {
    private _snippetMap: CachedPromise<Map<string, ISnippetInternal>> = new CachedPromise<Map<string, ISnippetInternal>>();

    public constructor(private readonly _snippetPath: string) {
    }

    public static createDefault(): ISnippetManager {
        return new SnippetManager(path.join(assetsPath, "armsnippets.jsonc"));
    }

    /**
     * Read snippets from file
     */
    private async getMap(): Promise<Map<string, ISnippetInternal>> {
        return await this._snippetMap.getOrCachePromise(async () => {
            const content: string = await readUtf8FileWithBom(this._snippetPath);
            const preprocessed = stripJsonComments(content);
            const snippets = <{ [key: string]: ISnippetDefinitionFromFile }>JSON.parse(preprocessed);
            const map = new Map<string, ISnippetInternal>();

            for (const name of Object.getOwnPropertyNames(snippets).filter(n => !n.startsWith('$'))) {
                const snippetFromFile = snippets[name];
                map.set(name, convertSnippet(name, snippetFromFile));
            }

            return map;
        });
    }

    /**
     * Retrieve all snippets
     */
    public async getSnippets(context: SnippetContext): Promise<ISnippet[]> {
        const map = await this.getMap();
        return Array.from(map.values())
            .filter(s => doesSnippetSupportContext(s, context));
    }

    /**
     * Retrieve completion items for all snippets
     */
    public async getSnippetsAsCompletionItems(context: SnippetContext, span: language.Span, _triggerCharacter: string | undefined, addDoubleQuotes: boolean): Promise<Completion.Item[]> {
        return await callWithTelemetryAndErrorHandling('getSnippetsAsCompletionItems', async (actionContext: IActionContext) => {
            actionContext.telemetry.suppressIfSuccessful = true;

            const map = await this.getMap();

            const items: Completion.Item[] = [];
            for (const entry of map.entries()) {
                const snippet = entry[1];
                if (doesSnippetSupportContext(snippet, context)) {
                    const name = entry[0];
                    const detail = `${snippet.description} (${extensionName})`;
                    let label = snippet.prefix;

                    if (addDoubleQuotes && !label.startsWith('"')) {
                        label = `"${label}"`;
                    }

                    items.push(new Completion.Item({
                        label: `{${label}}`, //asdf
                        snippetName: name,
                        detail,
                        insertText: snippet.insertText,
                        span,
                        kind: Completion.CompletionKind.Snippet,
                        // Make sure snippets show up after normal completions
                        priority: Completion.CompletionPriority.low,
                        // This allows users to search for snippets by either the label (prefix) or the non-abbreviated words in the name,
                        //  e.g. users can type "virtual" and find the "arm-vnet" snippet
                        //asdf filterText: `${label} ${name}`
                    }));
                }
            }

            return items;
        }) ?? [];
    }
}

/**
 * Is this snippet supported in the given context?
 */
function doesSnippetSupportContext(snippet: ISnippetInternal, context: SnippetContext): boolean {
    return snippet.context === context;
}

function convertSnippet(snippetName: string, snippetFromFile: ISnippetDefinitionFromFile): ISnippetInternal {
    const context = snippetFromFile.context;
    //
    // const context: SnippetContext | undefined = snippetFromFile.context === undefined
    //     ? SnippetContext.unspecified
    //     : (<{ [key: string]: SnippetContext | undefined }>SnippetContext)[snippetFromFile.context];
    // if (context === undefined) {
    //     assert.fail(`Snippet "${snippetName}" has invalid context "${snippetFromFile.context}`);
    // }

    if (context === undefined) {
        window.showWarningMessage(`Snippet "${snippetName}" has no context specified`);
    }

    const body: string = snippetFromFile.body.join('\n'); // vscode will change to EOL as appropriate
    const snippet: ISnippetInternal = {
        name: snippetName,
        prefix: snippetFromFile.prefix,
        description: snippetFromFile.description,
        insertText: body,
        context: context
    };

    const looksLikeResource = snippetFromFile.body.some(
        line => !!line.match(/"apiVersion"\s*:/)
    );
    const isResource = doesSnippetSupportContext(snippet, KnownSnippetContexts.resources);
    if (isResource) {
        if (!looksLikeResource) {
            window.showWarningMessage(`Snippet "${snippetName}" is marked with the resources context but doesn't looke like a resource`);
        }
    } else {
        if (looksLikeResource) {
            window.showWarningMessage(`Snippet "${snippetName}" looks like a resource but isn't supported in the resources context`);
        }
    }

    return snippet;
}
