import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { type ShortLink } from "../../api";
import CopyButton from "../../components/CopyButton";
import LinkSlug from "../../components/LinkSlug";

const useStyles = makeStyles({
  urlLink: {
    maxWidth: "320px",
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

export default function LinksTable({ links, origin, onEdit, onDelete }: Props) {
  const styles = useStyles();

  return (
    <Table arial-label="Short links">
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Short link</TableHeaderCell>
          <TableHeaderCell>Destination</TableHeaderCell>
          <TableHeaderCell>Interstitial</TableHeaderCell>
          <TableHeaderCell>Created</TableHeaderCell>
          <TableHeaderCell />
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((link) => (
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
