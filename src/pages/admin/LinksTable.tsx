import {
  Badge,
  Button,
  Caption1,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  type TableColumnDefinition,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tooltip,
  createTableColumn,
  makeStyles,
  tokens,
  useTableFeatures,
  useTableSort,
} from "@fluentui/react-components";
import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { type ShortLink } from "../../api";
import CopyButton from "../../components/CopyButton";
import LinkSlug from "../../components/LinkSlug";

const useStyles = makeStyles({
  urlLink: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "block",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    textDecorationLine: "none",
    ":hover": {
      textDecorationLine: "underline",
    },
  },
  mono: {
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  aliasList: {
    display: "flex",
    gap: "4px",
    flexWrap: "wrap",
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
  },
});

interface Props {
  links: ShortLink[];
  origin: string;
  onEdit: (link: ShortLink) => void;
  onDelete: (id: string) => void;
}

const columns: TableColumnDefinition<ShortLink>[] = [
  createTableColumn<ShortLink>({
    columnId: "id",
    compare: (a, b) => a.id.localeCompare(b.id),
  }),
  createTableColumn<ShortLink>({
    columnId: "url",
    compare: (a, b) => a.url.localeCompare(b.url),
  }),
  createTableColumn<ShortLink>({ columnId: "aliases" }),
  createTableColumn<ShortLink>({
    columnId: "interstitial",
    compare: (a, b) => {
      const rank = (l: ShortLink) =>
        l.interstitial === true ? 2 : l.interstitial === false ? 0 : 1;
      return rank(a) - rank(b);
    },
  }),
  createTableColumn<ShortLink>({
    columnId: "createdAt",
    compare: (a, b) => a.createdAt - b.createdAt,
  }),
];

export default function LinksTable({ links, origin, onEdit, onDelete }: Props) {
  const styles = useStyles();

  const {
    getRows,
    sort: { getSortDirection, toggleColumnSort, sort },
  } = useTableFeatures({ columns, items: links }, [
    useTableSort({
      defaultSortState: {
        sortColumn: "createdAt",
        sortDirection: "descending",
      },
    }),
  ]);

  const rows = sort(getRows());

  return (
    <Table
      aria-label="Short links"
      style={{ tableLayout: "fixed", width: "100%" }}
    >
      <TableHeader>
        <TableRow>
          <TableHeaderCell
            style={{ width: "160px" }}
            sortDirection={getSortDirection("id")}
            onClick={(e) => toggleColumnSort(e, "id")}
          >
            Short link
          </TableHeaderCell>
          <TableHeaderCell
            sortDirection={getSortDirection("url")}
            onClick={(e) => toggleColumnSort(e, "url")}
          >
            Destination
          </TableHeaderCell>
          <TableHeaderCell style={{ width: "180px" }}>Aliases</TableHeaderCell>
          <TableHeaderCell
            style={{ width: "100px" }}
            sortDirection={getSortDirection("interstitial")}
            onClick={(e) => toggleColumnSort(e, "interstitial")}
          >
            Interstitial
          </TableHeaderCell>
          <TableHeaderCell
            style={{ width: "90px" }}
            sortDirection={getSortDirection("createdAt")}
            onClick={(e) => toggleColumnSort(e, "createdAt")}
          >
            Created
          </TableHeaderCell>
          <TableHeaderCell style={{ width: "104px" }}>Actions</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ item: link }) => (
          <TableRow key={link.id}>
            <TableCell>
              <TableCellLayout>
                <LinkSlug id={link.id} size="sm" />
              </TableCellLayout>
            </TableCell>
            <TableCell>
              <TableCellLayout>
                <Tooltip content={link.url} relationship="description">
                  <a
                    className={styles.urlLink}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.url}
                  </a>
                </Tooltip>
              </TableCellLayout>
            </TableCell>
            <TableCell>
              <TableCellLayout>
                {link.aliases && link.aliases.length > 0 ? (
                  <div className={styles.aliasList}>
                    {link.aliases.map((a) => (
                      <Badge
                        key={a}
                        appearance="ghost"
                        color="subtle"
                        size="small"
                      >
                        <Caption1 className={styles.mono}>{a}</Caption1>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span
                    style={{
                      color: tokens.colorNeutralForeground4,
                      fontSize: tokens.fontSizeBase200,
                    }}
                  >
                    —
                  </span>
                )}
              </TableCellLayout>
            </TableCell>
            <TableCell>
              <TableCellLayout>
                {link.interstitial === true ? (
                  <Badge color="brand" appearance="tint">
                    Always
                  </Badge>
                ) : link.interstitial === false ? (
                  <Badge color="subtle" appearance="outline">
                    Never
                  </Badge>
                ) : (
                  <Badge color="subtle" appearance="tint">
                    Default
                  </Badge>
                )}
              </TableCellLayout>
            </TableCell>
            <TableCell>
              <TableCellLayout>
                <span className={styles.mono}>
                  {new Date(link.createdAt).toLocaleDateString()}
                </span>
              </TableCellLayout>
            </TableCell>
            <TableCell>
              <div className={styles.actions}>
                <CopyButton text={`${origin}/${link.id}`} />
                <Tooltip content="Edit" relationship="label">
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<EditRegular />}
                    onClick={() => onEdit(link)}
                  />
                </Tooltip>
                <Tooltip content="Delete" relationship="label">
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<DeleteRegular />}
                    onClick={() => onDelete(link.id)}
                  />
                </Tooltip>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
