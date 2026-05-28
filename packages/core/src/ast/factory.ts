import {Range} from '../types';
import * as nodes from './nodes.types';

const PLACEHOLDER_RANGE = new Range(0, 0, 0, 0);

export function createField(params: {
    range: Range;
    nameRange?: Range;
    typeRange?: Range;
    parent?: nodes.ThriftNode;
    id: number;
    fieldType: string;
    name: string;
    requiredness?: 'required' | 'optional';
    defaultValue?: string;
    defaultValueRange?: Range;
}): nodes.Field {
    return {
        type: nodes.ThriftNodeType.Field,
        range: params.range,
        nameRange: params.nameRange,
        typeRange: params.typeRange,
        parent: params.parent,
        id: params.id,
        requiredness: params.requiredness,
        fieldType: params.fieldType,
        name: params.name,
        defaultValue: params.defaultValue,
        defaultValueRange: params.defaultValueRange
    };
}

export function createDocument(params: {
    range: Range;
    body?: nodes.ThriftNode[];
    parent?: nodes.ThriftNode;
}): nodes.ThriftDocument {
    return {
        type: nodes.ThriftNodeType.Document,
        range: params.range,
        body: params.body ?? [],
        parent: params.parent
    };
}

export function createStructBlock(params: {
    type: nodes.ThriftNodeType.Struct | nodes.ThriftNodeType.Union | nodes.ThriftNodeType.Exception;
    name: string;
    nameRange?: Range;
    parent: nodes.ThriftNode;
}): nodes.Struct {
    return {
        type: params.type,
        name: params.name,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        fields: []
    };
}

export function createEnumBlock(params: {
    name: string;
    nameRange?: Range;
    parent: nodes.ThriftNode;
    isSenum: boolean;
}): nodes.Enum {
    return {
        type: nodes.ThriftNodeType.Enum,
        name: params.name,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        members: [],
        isSenum: params.isSenum
    };
}

export function createServiceBlock(params: {
    name: string;
    nameRange?: Range;
    parent: nodes.ThriftNode;
    extends?: string;
    extendsRange?: Range;
}): nodes.Service {
    return {
        type: nodes.ThriftNodeType.Service,
        name: params.name,
        extends: params.extends,
        extendsRange: params.extendsRange,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        functions: []
    };
}

export function createInteractionBlock(params: {
    name: string;
    nameRange?: Range;
    parent: nodes.ThriftNode;
}): nodes.Interaction {
    return {
        type: nodes.ThriftNodeType.Interaction,
        name: params.name,
        range: PLACEHOLDER_RANGE,
        nameRange: params.nameRange,
        parent: params.parent,
        functions: []
    };
}
