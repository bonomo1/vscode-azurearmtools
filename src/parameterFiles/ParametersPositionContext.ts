// ----------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.  All rights reserved.
// ----------------------------------------------------------------------------

import * as Completion from "../Completion";
import { DeploymentTemplate } from "../DeploymentTemplate";
import * as language from "../Language";
import { IReferenceSite, PositionContext, ReferenceSiteKind } from "../PositionContext";
import { ReferenceList } from "../ReferenceList";
import * as TLE from '../TLE';
import { DeploymentParameters } from "./DeploymentParameters";
import { getPropertyValueCompletionItems } from "./ParameterValues";

/**
 * Represents a position inside the snapshot of a deployment parameter file, plus all related information
 * that can be parsed and analyzed about it from that position.
 */
export class ParametersPositionContext extends PositionContext {
    // CONSIDER: pass in function to *get* the deployment template, not the template itself?
    private _associatedTemplate: DeploymentTemplate | undefined;

    private constructor(deploymentParameters: DeploymentParameters, associatedTemplate: DeploymentTemplate | undefined) {
        super(deploymentParameters, associatedTemplate);
        this._associatedTemplate = associatedTemplate;
    }

    public static fromDocumentLineAndColumnIndices(deploymentParameters: DeploymentParameters, documentLineIndex: number, documentColumnIndex: number, associatedTemplate: DeploymentTemplate | undefined): ParametersPositionContext {
        let context = new ParametersPositionContext(deploymentParameters, associatedTemplate);
        context.initFromDocumentLineAndColumnIndices(documentLineIndex, documentColumnIndex);
        return context;
    }
    public static fromDocumentCharacterIndex(deploymentParameters: DeploymentParameters, documentCharacterIndex: number, deploymentTemplate: DeploymentTemplate | undefined): ParametersPositionContext {
        let context = new ParametersPositionContext(deploymentParameters, deploymentTemplate);
        context.initFromDocumentCharacterIndex(documentCharacterIndex);
        return context;
    }

    public get document(): DeploymentParameters {
        return <DeploymentParameters>super.document;
    }

    /**
     * If this position is inside an expression, inside a reference to an interesting function/parameter/etc, then
     * return an object with information about this reference and the corresponding definition
     */
    public getReferenceSiteInfo(_includeDefinition: boolean): IReferenceSite | undefined {
        if (!this._associatedTemplate) {
            return undefined;
        }

        for (let paramValue of this.document.parameterValueDefinitions) {
            // Are we inside the name of a parameter?
            if (paramValue.nameValue.span.contains(this.documentCharacterIndex, language.Contains.extended)) {
                // Does it have an associated parameter definition in the template?
                const paramDef = this._associatedTemplate?.topLevelScope.getParameterDefinition(paramValue.nameValue.unquotedValue);
                if (paramDef) {
                    return {
                        referenceKind: ReferenceSiteKind.reference,
                        unquotedReferenceSpan: paramValue.nameValue.unquotedSpan,
                        referenceDocument: this.document,
                        definition: paramDef,
                        definitionDocument: this._associatedTemplate
                    };
                }

                break;
            }
        }

        return undefined;
    }

    /**
     * Return all references to the given reference site info in this document
     * @returns undefined if references are not supported at this location, or empty list if supported but none found
     */
    protected getReferencesCore(): ReferenceList | undefined {
        const refInfo = this.getReferenceSiteInfo(false);
        return refInfo ? this.document.findReferencesToDefinition(refInfo.definition) : undefined;
    }

    public async getCompletionItems(triggerCharacter: string | undefined): Promise<Completion.Item[]> {
        return getPropertyValueCompletionItems(
            this._associatedTemplate?.topLevelScope,
            this.document.parameterValuesSource,
            this.documentCharacterIndex,
            triggerCharacter
        );
    }

    public getSignatureHelp(): TLE.FunctionSignatureHelp | undefined {
        return undefined;
    }
}
