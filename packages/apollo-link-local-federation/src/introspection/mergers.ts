import {
  IntrospectionType,
  IntrospectionEnumType,
  IntrospectionObjectType,
  IntrospectionInterfaceType,
  IntrospectionField,
  IntrospectionInputObjectType,
  IntrospectionSchema,
  IntrospectionNamedTypeRef,
  IntrospectionDirective,
  IntrospectionUnionType,
} from 'graphql'

type NamedPartial<T extends IntrospectionType = IntrospectionType> = Partial<T> & IntrospectionNamedTypeRef<T>

const mergeDescriptions = (typeA: { description?: string | null }, typeB: { description?: string | null }) => {
  if (!typeA.description) {
    return typeB.description
  }

  if (!typeB.description || typeA.description === typeB.description) {
    return typeA.description
  }

  return `${typeA.description}\n${typeB.description}`
}

const mergeDirectives = (
  directiveA: Partial<IntrospectionDirective>,
  directiveB: Partial<IntrospectionDirective>
): IntrospectionDirective => {
  const argsByName = new Map(directiveA.args?.map(arg => [arg.name, arg]) || [])
  const locations = new Set([...(directiveA.locations || []), ...(directiveB.locations || [])])

  directiveB.args?.forEach(arg => {
    argsByName.set(arg.name, arg)
  })

  return {
    name: directiveA.name || '',
    description: mergeDescriptions(directiveA, directiveB),
    isRepeatable: directiveA.isRepeatable || directiveB.isRepeatable,
    args: Array.from(argsByName.values()),
    locations: Array.from(locations.values()),
  }
}

const mergeEnumTypes = (
  typeA: NamedPartial<IntrospectionEnumType>,
  typeB: NamedPartial<IntrospectionEnumType>
): IntrospectionEnumType => {
  const enumValuesByName = new Map((typeA.enumValues || []).map(enumValue => [enumValue.name, enumValue]))

  ;(typeB.enumValues || []).forEach(enumValue => {
    if (!enumValuesByName.has(enumValue.name)) {
      enumValuesByName.set(enumValue.name, enumValue)
      return
    }

    enumValuesByName.set(enumValue.name, {
      ...enumValue,
      description: mergeDescriptions(enumValuesByName.get(enumValue.name)!, enumValue),
    })
  })

  return {
    kind: 'ENUM',
    name: typeA.name,
    description: mergeDescriptions(typeA, typeB),
    enumValues: Array.from(enumValuesByName.values()),
  }
}

const mergeInputObjects = (
  typeA: Partial<IntrospectionInputObjectType>,
  typeB: Partial<IntrospectionInputObjectType>
): IntrospectionInputObjectType => {
  const inputFieldsByName = new Map(typeA.inputFields?.map(inputField => [inputField.name, inputField]) || [])

  typeB.inputFields?.forEach(inputField => inputFieldsByName.set(inputField.name, inputField))

  return {
    kind: 'INPUT_OBJECT',
    name: typeA.name || '',
    description: mergeDescriptions(typeA, typeB),
    inputFields: Array.from(inputFieldsByName.values()),
  }
}

type PartialField = Partial<IntrospectionField> & { name: string }
const mergeFields = (fieldA: PartialField, fieldB: PartialField): IntrospectionField => {
  const argsByName = new Map((fieldA.args || []).map(arg => [arg.name, arg]))

  ;(fieldB.args || []).forEach(arg => {
    argsByName.set(arg.name, arg)
  })

  return {
    type: fieldA.type!,
    name: fieldA.name,
    description: mergeDescriptions(fieldA, fieldB),
    isDeprecated: fieldA.isDeprecated || fieldB.isDeprecated || false,
    deprecationReason: fieldA.deprecationReason || fieldB.deprecationReason,
    args: Array.from(argsByName.values()),
  }
}

const mergeInterfaces = (
  typeA: NamedPartial<IntrospectionInterfaceType>,
  typeB: NamedPartial<IntrospectionInterfaceType>
): IntrospectionInterfaceType => {
  const interfacesByName = new Map((typeA.interfaces || []).map(iface => [iface.name, iface]))
  const possibleTypesByName = new Map((typeA.possibleTypes || []).map(possibleType => [possibleType.name, possibleType]))
  const fieldsByName = new Map((typeA.fields || []).map(field => [field.name, field]))

  ;(typeB.interfaces || []).forEach(iface => {
    interfacesByName.set(iface.name, iface)
  })
  ;(typeB.possibleTypes || []).forEach(possibleType => {
    possibleTypesByName.set(possibleType.name, possibleType)
  })
  ;(typeB.fields || []).forEach(field => {
    if (!fieldsByName.has(field.name)) {
      fieldsByName.set(field.name, field)
      return
    }

    fieldsByName.set(field.name, mergeFields(fieldsByName.get(field.name)!, field))
  })

  return {
    kind: 'INTERFACE',
    name: typeA.name,
    description: mergeDescriptions(typeA, typeB),
    interfaces: Array.from(interfacesByName.values()),
    possibleTypes: Array.from(possibleTypesByName.values()),
    fields: Array.from(fieldsByName.values()),
  }
}

const mergeObjects = (
  typeA: NamedPartial<IntrospectionObjectType>,
  typeB: NamedPartial<IntrospectionObjectType>
): IntrospectionObjectType => {
  const interfacesByName = new Map((typeA.interfaces || []).map(iface => [iface.name, iface]))
  const fieldsByName = new Map((typeA.fields || []).map(field => [field.name, field]))

  ;(typeB.interfaces || []).forEach(iface => {
    interfacesByName.set(iface.name, iface)
  })
  ;(typeB.fields || []).forEach(field => {
    if (!fieldsByName.has(field.name)) {
      fieldsByName.set(field.name, field)
      return
    }

    fieldsByName.set(field.name, mergeFields(fieldsByName.get(field.name)!, field))
  })

  return {
    kind: 'OBJECT',
    name: typeA.name,
    description: mergeDescriptions(typeA, typeB),
    interfaces: Array.from(interfacesByName.values()),
    fields: Array.from(fieldsByName.values()),
  }
}

const mergeUnions = (
  typeA: NamedPartial<IntrospectionUnionType>,
  typeB: NamedPartial<IntrospectionUnionType>
): IntrospectionUnionType => {
  const possibleTypesByName = new Map((typeA.possibleTypes || []).map(possibleType => [possibleType.name, possibleType]))

  ;(typeB.possibleTypes || []).forEach(possibleType => {
    possibleTypesByName.set(possibleType.name, possibleType)
  })

  return {
    kind: 'UNION',
    name: typeA.name,
    description: mergeDescriptions(typeA, typeB),
    possibleTypes: Array.from(possibleTypesByName.values()),
  }
}

export const mergeTypes = (typeA: NamedPartial<IntrospectionType>, typeB: NamedPartial<IntrospectionType>): IntrospectionType => {
  switch (typeA.kind) {
    case 'ENUM': {
      return mergeEnumTypes(typeA as NamedPartial<IntrospectionEnumType>, typeB as NamedPartial<IntrospectionEnumType>)
    }
    case 'SCALAR': {
      return typeA
    }
    case 'INTERFACE': {
      return mergeInterfaces(typeA as NamedPartial<IntrospectionInterfaceType>, typeB as NamedPartial<IntrospectionInterfaceType>)
    }
    case 'OBJECT': {
      return mergeObjects(typeA as NamedPartial<IntrospectionObjectType>, typeB as NamedPartial<IntrospectionObjectType>)
    }
    case 'UNION': {
      return mergeUnions(typeA as NamedPartial<IntrospectionUnionType>, typeB as NamedPartial<IntrospectionUnionType>)
    }
    case 'INPUT_OBJECT': {
      return mergeInputObjects(typeA as IntrospectionInputObjectType, typeB as IntrospectionInputObjectType)
    }
  }
}

export const mergeSchemas = (schemas: Array<Partial<IntrospectionSchema>>): IntrospectionSchema => {
  const typesByName = new Map<string, IntrospectionType>()
  const directivesByName = new Map<string, IntrospectionDirective>()

  let queryType: NamedPartial<IntrospectionObjectType> | null = null
  let mutationType: NamedPartial<IntrospectionObjectType> | null = null
  let subscriptionType: NamedPartial<IntrospectionObjectType> | null = null

  schemas.forEach(schema => {
    ;(schema.types || []).forEach(type => {
      if (!typesByName.has(type.name)) {
        typesByName.set(type.name, type)
      } else {
        typesByName.set(type.name, mergeTypes(typesByName.get(type.name)!, type))
      }
    })
    ;(schema.directives || []).forEach(directive => {
      if (!directivesByName.has(directive.name)) {
        directivesByName.set(directive.name, directive)
      } else {
        directivesByName.set(directive.name, mergeDirectives(directivesByName.get(directive.name)!, directive))
      }
    })
    if (schema.queryType) {
      queryType = queryType ? mergeObjects(queryType, schema.queryType) : schema.queryType
    }

    if (schema.mutationType) {
      mutationType = mutationType ? mergeObjects(mutationType, schema.mutationType) : schema.mutationType
    }

    if (schema.subscriptionType) {
      subscriptionType = subscriptionType ? mergeObjects(subscriptionType, schema.subscriptionType) : schema.subscriptionType
    }
  })

  const types = Array.from(typesByName.values())

  if (!queryType) {
    queryType = {
      kind: 'OBJECT',
      name: 'Query',
    }

    types.push({
      kind: 'OBJECT',
      name: 'Query',
      fields: [
        {
          name: '_noop',
          args: [],
          isDeprecated: false,
          type: {
            kind: 'SCALAR',
            name: 'String',
          },
        },
      ],
      interfaces: [],
    })
  }

  return {
    queryType,
    mutationType,
    subscriptionType,
    types,
    directives: Array.from(directivesByName.values()),
  }
}
