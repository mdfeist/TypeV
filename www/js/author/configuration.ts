import Author, {AuthorIdentity} from './';

/**
 * Configuration for authors.
 */
export default class AuthorConfiguration {
  private _enabled = new WeakSet<Author>();
  private _aliases = new Map<AuthorIdentity, Author>();

  constructor({aliases, enabled}: ConfigurationJSON) {
    /* Add all aliases. */
    for (let name of Object.keys(aliases)) {
      this._mapTo(name, aliases[name]);
    }

    /* Enable all authors explicitly. */
    for (let name of enabled) {
      this.enableAuthorByName(name);
    }
  }

  getAuthorByName(name: string): Author {
    let alias = AuthorIdentity.get(name);
    let author = this._aliases.get(alias);

    if (!author) {
      throw new Error(`Author not known: ${alias}`);
    }

    return author;
  }

  enableAuthorByName(name: string): void {
    let author = this.getAuthorByName(name);
    this._enabled.add(author);
  }

  disableAuthorByName(name: string): void {
    let author = this.getAuthorByName(name);
    this._enabled.delete(author);
  }

  addAlias(alias: AuthorIdentity, author: Author) {
    let existingMapping: Author = this._aliases.get(alias)

    /* Check if we're remapping an existing alias. */
    if (existingMapping && existingMapping.primaryIdentity !== alias) {
      throw new Error(`Alias already mapped: ${alias.shorthand} => ${existingMapping.shorthand}`);
    }

    this._aliases.set(alias, author);
  }

  isEnabled(author: Author): boolean {
    return this._enabled.has(author);
  }

  /**
   * Maps an alias name to an author.
   */
  protected _mapTo(aliasName: string, authorName: string) {
    let alias = AuthorIdentity.get(aliasName)
    let author = this._vivifyAuthor(alias);

    this.addAlias(alias, author);
  }

  protected _vivifyAuthor(id: AuthorIdentity): Author {
    let author = this._aliases.get(id);

    if (!author) {
      author = new Author(id);
      this.addAlias(id, author);
    }

    return author;
  }
}

interface ConfigurationJSON {
  aliases: { [name: string]: string };
  enabled: string[];
}