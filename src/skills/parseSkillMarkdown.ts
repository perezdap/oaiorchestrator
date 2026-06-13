export interface ParsedSkillMarkdown {
  name: string;
  description?: string;
  body: string;
}

export function parseSkillMarkdown(content: string, fallbackName: string): ParsedSkillMarkdown {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { name: fallbackName, body: content.trim() };
  }

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim() ?? fallbackName,
    description: descriptionMatch?.[1]?.trim(),
    body,
  };
}
