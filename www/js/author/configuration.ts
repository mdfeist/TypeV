import Author, {AuthorIdentity} from './';

import assert from '../assert';

/**
 * A map of name of alias to name of author.
 */
export interface AliasMap {
  [name: string]: string;
}

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
      let author = this.getAuthorByName(name);
      this.enable(author);
    }
  }

  get authors(): Set<Author> {
    return new Set(this._aliases.values());
  }

  get aliases(): Iterable<AuthorIdentity> {
    return this._aliases.keys();
  }

  getAuthorByName(name: string): Author {
    let alias = AuthorIdentity.get(name);
    return this.get(alias);
  }

  get(alias: AuthorIdentity): Author {
    let author = this._aliases.get(alias);

    if (!author) {
      throw new Error(`Author not known: ${alias}`);
    }

    return author;
  }

  enable(author: Author): void {
    this._enabled.add(author);
  }

  disable(author: Author): void {
    this._enabled.delete(author);
  }

  /**
   * True if the ID is a primary identity of some author.
   */
  isPrimaryIdentity(id: AuthorIdentity): boolean {
    let author = this.get(id);
    return author.primaryIdentity === id;
  }

  addAlias(alias: AuthorIdentity, author: Author) {
    let existingMapping: Author = this._aliases.get(alias)

    /* Check if we're remapping an existing alias. */
    if (existingMapping && existingMapping.primaryIdentity !== alias) {
      throw new Error(`Alias already mapped: ${alias.shorthand} => ${existingMapping.shorthand}`);
    }

    this._aliases.set(alias, author);
  }

  removeAlias(id: AuthorIdentity): void {
    let numberAuthorsBefore = this.authors.size;
    let originalAuthor = this.get(id);
    this._aliases.delete(id);

    let newAuthor = this._vivifyAuthor(id);
    this.addAlias(id, newAuthor);

    if (this.isEnabled(originalAuthor)) {
      this.enable(newAuthor);
    }

    assert(this.authors.size === 1 + numberAuthorsBefore);
  }

  isEnabled(author: Author): boolean {
    return this._enabled.has(author);
  }

  toPlainObject(): ConfigurationJSON {
    let aliases: { [name: string]: string } = {};
    let enabled: string[] = [];

    for (let [alias, author] of this._aliases) {
      aliases[alias.shorthand] = author.id;
    }

    for (let author of this.authors) {
      if (this.isEnabled(author)) {
        enabled.push(author.id);
      }
    }

    return { aliases, enabled }
  }

  /**
   * Maps an alias name to an author name.
   */
  protected _mapTo(aliasName: string, authorName: string) {
    let alias = AuthorIdentity.get(aliasName);
    let primaryIdentity = AuthorIdentity.get(authorName);
    let author = this._vivifyAuthor(primaryIdentity);

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

  /**
   * Generate a configuration from a list of authors.
   * All authors are enabled, and every name maps to itself.
   */
  static generateDefaultConfiguration(names: string[]): AuthorConfiguration {
    let aliases: AliasMap = {};

    /* Map each name to itself. */
    for (let name of names) {
      aliases[name] = name;
    }

    return new AuthorConfiguration({
      aliases,
      /* Enable all names. */
      enabled: names
    });
  }
}

interface ConfigurationJSON {
  aliases: AliasMap;
  enabled: string[];
}
