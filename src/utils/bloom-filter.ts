/**
 * 布隆过滤器实现
 * 用于快速判断URL是否可能存在于书签集合中
 */
export class BloomFilter {
  private size: number;
  private hashCount: number;
  private bitArray: Uint8Array;
  private itemCount: number = 0;

  /**
   * 创建布隆过滤器
   * @param expectedItems 预期元素数量
   * @param falsePositiveRate 期望的误判率
   */
  constructor(expectedItems: number = 100000, falsePositiveRate: number = 0.001) {
    // 计算最优的位数组大小和哈希函数数量
    this.size = this.calculateOptimalSize(expectedItems, falsePositiveRate);
    this.hashCount = this.calculateOptimalHashCount(this.size, expectedItems);
    this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
  }

  /**
   * 计算最优的位数组大小
   * m = -n * ln(p) / (ln(2)^2)
   */
  private calculateOptimalSize(n: number, p: number): number {
    return Math.ceil(-n * Math.log(p) / (Math.log(2) ** 2));
  }

  /**
   * 计算最优的哈希函数数量
   * k = (m / n) * ln(2)
   */
  private calculateOptimalHashCount(m: number, n: number): number {
    return Math.ceil((m / n) * Math.log(2));
  }

  /**
   * 使用多个哈希函数（基于双重哈希）
   */
  private hash(item: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < item.length; i++) {
      hash = ((hash << 5) - hash) + item.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % this.size;
  }

  /**
   * MurmurHash3的简化版本，用作第二个哈希函数
   */
  private murmurHash(item: string, seed: number): number {
    let h = seed;
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    const r1 = 15;
    const r2 = 13;
    const m = 5;
    const n = 0xe6546b64;

    for (let i = 0; i < item.length; i++) {
      let k = item.charCodeAt(i);
      k = Math.imul(k, c1);
      k = (k << r1) | (k >>> (32 - r1));
      k = Math.imul(k, c2);

      h ^= k;
      h = (h << r2) | (h >>> (32 - r2));
      h = Math.imul(h, m) + n;
    }

    h ^= item.length;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;

    return Math.abs(h) % this.size;
  }

  /**
   * 获取所有哈希位置
   */
  private getHashPositions(item: string): number[] {
    const positions: number[] = [];
    const hash1 = this.hash(item, 0);
    const hash2 = this.murmurHash(item, 1);

    for (let i = 0; i < this.hashCount; i++) {
      // 使用双重哈希生成多个哈希值
      const position = (hash1 + i * hash2) % this.size;
      positions.push(position);
    }

    return positions;
  }

  /**
   * 添加元素到布隆过滤器
   */
  add(item: string): void {
    const positions = this.getHashPositions(item);
    
    for (const position of positions) {
      const byteIndex = Math.floor(position / 8);
      const bitIndex = position % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    }
    
    this.itemCount++;
  }

  /**
   * 批量添加元素
   */
  addMany(items: string[]): void {
    for (const item of items) {
      this.add(item);
    }
  }

  /**
   * 检查元素是否可能存在
   * @returns true 表示可能存在，false 表示确定不存在
   */
  contains(item: string): boolean {
    const positions = this.getHashPositions(item);
    
    for (const position of positions) {
      const byteIndex = Math.floor(position / 8);
      const bitIndex = position % 8;
      
      if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
        return false; // 确定不存在
      }
    }
    
    return true; // 可能存在
  }

  /**
   * 批量检查元素
   */
  containsMany(items: string[]): string[] {
    return items.filter(item => this.contains(item));
  }

  /**
   * 序列化为Base64字符串
   */
  serialize(): string {
    const metadata = new Uint32Array([this.size, this.hashCount, this.itemCount]);
    const metadataBytes = new Uint8Array(metadata.buffer);
    
    const combined = new Uint8Array(metadataBytes.length + this.bitArray.length);
    combined.set(metadataBytes);
    combined.set(this.bitArray, metadataBytes.length);
    
    // 转换为Base64
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  }

  /**
   * 从Base64字符串反序列化
   */
  static deserialize(data: string): BloomFilter {
    // 从Base64解码
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // 提取元数据
    const metadataBytes = bytes.slice(0, 12);
    const metadata = new Uint32Array(metadataBytes.buffer);
    const [size, hashCount, itemCount] = metadata;
    
    // 创建新的布隆过滤器
    const filter = new BloomFilter();
    filter.size = size;
    filter.hashCount = hashCount;
    filter.itemCount = itemCount;
    filter.bitArray = bytes.slice(12);
    
    return filter;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      size: this.size,
      hashCount: this.hashCount,
      itemCount: this.itemCount,
      sizeInBytes: this.bitArray.length,
      estimatedFalsePositiveRate: this.getEstimatedFalsePositiveRate()
    };
  }

  /**
   * 计算当前的预估误判率
   */
  private getEstimatedFalsePositiveRate(): number {
    const ratio = this.itemCount / this.size;
    return Math.pow(1 - Math.exp(-this.hashCount * ratio), this.hashCount);
  }

  /**
   * 清空过滤器
   */
  clear(): void {
    this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
    this.itemCount = 0;
  }
}