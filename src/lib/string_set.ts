export default class StringSet {
  private _items: { [key: string]: number } = {};
  private _nums: { [key: number]: number } = {};
  private _length: number;

  constructor(items?: Array<string | number>) {
    this._length = items ? items.length : 0;
    if (!items) return;
    
    for (let i = 0, l = items.length; i < l; i++) {
      this.add(items[i]);
      if (items[i] === undefined) continue;
      if (typeof items[i] === 'string') {
        this._items[items[i] as string] = i;
      } else {
        this._nums[items[i] as number] = i;
      }
    }
  }

  add(x: string | number): this {
    if (this.has(x)) return this;
    this._length++;
    if (typeof x === 'string') {
      this._items[x] = this._length;
    } else {
      this._nums[x] = this._length;
    }
    return this;
  }

  delete(x: string | number): this {
    if (this.has(x) === false) return this;
    this._length--;
    delete this._items[x as string];
    delete this._nums[x as number];
    return this;
  }

  has(x: string | number): boolean {
    if (typeof x !== 'string' && typeof x !== 'number') return false;
    return this._items[x as string] !== undefined || this._nums[x as number] !== undefined;
  }

  values(): Array<string | number> {
    const values: Array<{ k: string | number, v: number }> = [];
    Object.keys(this._items).forEach((k: string) => {
      values.push({ k, v: this._items[k] });
    });
    Object.keys(this._nums).forEach((k: string) => {
      values.push({ k: JSON.parse(k), v: this._nums[JSON.parse(k)] });
    });

    return values.sort((a, b) => a.v - b.v).map(a => a.k);
  }

  clear(): this {
    this._length = 0;
    this._items = {};
    this._nums = {};
    return this;
  }
}
