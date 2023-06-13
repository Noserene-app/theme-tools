import {
  LiquidHtmlNodeTypes as NodeTypes,
  LiquidHtmlNodeOfType as NodeOfType,
  Severity,
  SourceCodeType,
  LiquidCheckDefinition,
  SchemaProp,
} from '../../types';
import { last } from '../../utils';
import { isNodeOfType } from '../utils';

type VariableLookup = NodeOfType<NodeTypes.VariableLookup>;

const schema = {
  minSize: SchemaProp.number(1),
  maxSize: SchemaProp.number(50),
};

export const PaginationSize: LiquidCheckDefinition<typeof schema> = {
  meta: {
    code: 'PaginationSize',
    name: 'Ensure paginate tags are used with performant sizes',
    docs: {
      description: 'This check is aimed at keeping response times low.',
      url: 'https://shopify.dev/docs/themes/tools/theme-check/checks/pagination-size',
      recommended: true,
    },
    type: SourceCodeType.LiquidHtml,
    severity: Severity.WARNING,
    schema,
    targets: [],
  },

  create(context) {
    const minSize = context.settings.minSize;
    const maxSize = context.settings.maxSize;
    let schemaSettings: any[] = [];
    const collectedPaginateNodes: VariableLookup[] = [];

    function checkPageSize(
      pageSizeNode: any,
      value: number,
      message: string = `Pagination size must be a positive integer between ${minSize} and ${maxSize}.`,
    ) {
      if (minSize <= value && value <= maxSize) return;
      context.report({
        message,
        startIndex: pageSizeNode.position.start,
        endIndex: pageSizeNode.position.end,
      });
    }

    return {
      async LiquidTag(node: NodeOfType<NodeTypes.LiquidTag>) {
        if (typeof node.markup === 'string' || node.name !== 'paginate') return;

        const pageSizeNode = node.markup.pageSize;

        if (isNodeOfType(NodeTypes.VariableLookup, pageSizeNode)) {
          collectedPaginateNodes.push(pageSizeNode);
        } else if (isNodeOfType(NodeTypes.Number, pageSizeNode)) {
          checkPageSize(pageSizeNode, Number(pageSizeNode.value));
        }
      },

      async LiquidRawTag(node: NodeOfType<NodeTypes.LiquidRawTag>) {
        if (node.name === 'schema') {
          try {
            const schema = JSON.parse(node.body.value);
            if (schema.settings && Array.isArray(schema.settings)) {
              schemaSettings = schema.settings;
            }
          } catch (error) {
            // Ignore JSON parsing errors
          }
        }
      },

      async onCodePathEnd() {
        collectedPaginateNodes.forEach((paginateNode) => {
          const lastLookup = last(paginateNode.lookups);
          if (lastLookup === undefined) return;

          if (lastLookup.type !== NodeTypes.String) return;

          const settingId = lastLookup.value;
          const setting = schemaSettings.find((setting) => setting.id === settingId);

          if (setting === undefined) return;

          if (setting.default === undefined) {
            context.report({
              message: `Default pagination size should be defined in the section settings.`,
              startIndex: paginateNode.position.start,
              endIndex: paginateNode.position.end,
            });
            return;
          }

          checkPageSize(
            paginateNode,
            setting.default,
            `This setting's default value should be between ${minSize} and ${maxSize} but is currently ${setting.default}.`,
          );
        });
      },
    };
  },
};
