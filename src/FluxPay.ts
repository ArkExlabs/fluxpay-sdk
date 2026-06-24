import {
  ethers,
  Contract,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type InterfaceAbi,
  type LogDescription,
  type Signer,
} from "ethers";

export type FluxPayAmount = bigint | string | number;

export type FluxPayClientConfig = {
  contractAddress: string;
  abi: InterfaceAbi;
  signer: Signer;
};

export type NativePaymentRequest = {
  projectCreator: string;
  amount: FluxPayAmount;
};

export type TokenPaymentRequest = {
  token: string;
  amount: FluxPayAmount;
  projectCreator: string;
};

export type UpdateConfigRequest = {
  treasury: string;
  feeRate: number;
};

export type FluxPayPaymentReceipt = ContractTransactionReceipt | null;

export type FluxPayParsedEventName =
  | "PaymentReceived"
  | "ConfigUpdated"
  | "ProductionLocked";

export type FluxPayDecodedPaymentReceived = {
  name: "PaymentReceived";
  buyer: string;
  token: string;
  amount: bigint;
  fee: bigint;
  logIndex: number | null;
  transactionHash: string | null;
};

export type FluxPayDecodedConfigUpdated = {
  name: "ConfigUpdated";
  treasuryWallet: string;
  feeRate: bigint;
  logIndex: number | null;
  transactionHash: string | null;
};

export type FluxPayDecodedProductionLocked = {
  name: "ProductionLocked";
  logIndex: number | null;
  transactionHash: string | null;
};

export type FluxPayDecodedEvent =
  | FluxPayDecodedPaymentReceived
  | FluxPayDecodedConfigUpdated
  | FluxPayDecodedProductionLocked;

export type FluxPayParsedReceipt = {
  transactionHash: string | null;
  blockNumber: number | null;
  events: FluxPayDecodedEvent[];
  paymentReceived: FluxPayDecodedPaymentReceived[];
  configUpdated: FluxPayDecodedConfigUpdated[];
  productionLocked: FluxPayDecodedProductionLocked[];
};

export type FluxPayNormalizedTransaction = {
  transactionHash: string | null;
  blockNumber: number | null;
  receipt: FluxPayPaymentReceipt;
  parsed: FluxPayParsedReceipt;
};

export type FluxPayPaymentResult = FluxPayNormalizedTransaction & {
  payment: FluxPayDecodedPaymentReceived;
};

export type FluxPayConfigUpdateResult = FluxPayNormalizedTransaction & {
  config: FluxPayDecodedConfigUpdated;
};

type LogLike = {
  topics?: readonly string[];
  data?: string;
  index?: number;
  logIndex?: number;
  transactionHash?: string;
};

export class FluxPay {
  private readonly contract: Contract;
  private readonly signer: Signer;
  private readonly contractAddress: string;

  /**
   * Backward-compatible constructor.
   *
   * @param contractAddress - The deployed proxy address.
   * @param abi - The FluxPayProcessor ABI.
   * @param signer - The ethers Signer instance.
   */
  constructor(contractAddress: string, abi: InterfaceAbi, signer: Signer) {
    FluxPay.assertAddress(contractAddress, "contractAddress");

    this.contractAddress = contractAddress;
    this.contract = new Contract(contractAddress, abi, signer);
    this.signer = signer;
  }

  /**
   * Preferred typed constructor for SDK consumers.
   */
  static connect(config: FluxPayClientConfig): FluxPay {
    return new FluxPay(config.contractAddress, config.abi, config.signer);
  }

  getContract(): Contract {
    return this.contract;
  }

  getSigner(): Signer {
    return this.signer;
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  /**
   * Initialize the contract.
   *
   * For UUPS proxy deployments, initialize is normally called by deployProxy.
   * SDK users should not call this on an already-initialized proxy.
   */
  async initialize(
    owner: string,
    treasury: string,
    feeRate: number
  ): Promise<FluxPayPaymentReceipt> {
    FluxPay.assertAddress(owner, "owner");
    FluxPay.assertAddress(treasury, "treasury");
    FluxPay.assertFeeRate(feeRate);

    const currentOwner = await this.contract.owner();

    if (currentOwner !== ethers.ZeroAddress) {
      throw new Error("Contract already initialized");
    }

    const tx = await this.contract.initialize(owner, treasury, feeRate);
    return await tx.wait();
  }

  /**
   * Preferred typed native-token payment method.
   *
   * On ETH-like networks this sends ETH.
   * On other EVM networks this sends the native gas token.
   */
  async payNative(
    request: NativePaymentRequest
  ): Promise<FluxPayPaymentReceipt> {
    FluxPay.assertAddress(request.projectCreator, "projectCreator");

    const value = FluxPay.toBigIntAmount(request.amount, "amount");

    if (value <= 0n) {
      throw new Error("amount must be greater than zero");
    }

    const tx: ContractTransactionResponse = await this.contract.payWithETH(
      request.projectCreator,
      { value }
    );

    return await tx.wait();
  }

  /**
   * Native payment helper that returns a normalized payment result.
   */
  async payNativeAndParse(
    request: NativePaymentRequest
  ): Promise<FluxPayPaymentResult> {
    const receipt = await this.payNative(request);
    return this.buildPaymentResult(receipt);
  }

  /**
   * Backward-compatible native payment method.
   */
  async payWithETH(
    projectCreator: string,
    amount: FluxPayAmount
  ): Promise<FluxPayPaymentReceipt> {
    return await this.payNative({
      projectCreator,
      amount,
    });
  }

  /**
   * Preferred typed ERC-20 payment method.
   *
   * The caller must approve the FluxPay proxy before calling this method.
   */
  async payToken(
    request: TokenPaymentRequest
  ): Promise<FluxPayPaymentReceipt> {
    FluxPay.assertAddress(request.token, "token");
    FluxPay.assertAddress(request.projectCreator, "projectCreator");

    const amount = FluxPay.toBigIntAmount(request.amount, "amount");

    if (amount <= 0n) {
      throw new Error("amount must be greater than zero");
    }

    const tx: ContractTransactionResponse = await this.contract.payWithToken(
      request.token,
      amount,
      request.projectCreator
    );

    return await tx.wait();
  }

  /**
   * ERC-20 payment helper that returns a normalized payment result.
   */
  async payTokenAndParse(
    request: TokenPaymentRequest
  ): Promise<FluxPayPaymentResult> {
    const receipt = await this.payToken(request);
    return this.buildPaymentResult(receipt);
  }

  /**
   * Backward-compatible ERC-20 payment method.
   */
  async payWithToken(
    token: string,
    amount: FluxPayAmount,
    projectCreator: string
  ): Promise<FluxPayPaymentReceipt> {
    return await this.payToken({
      token,
      amount,
      projectCreator,
    });
  }

  /**
   * Preferred typed admin config update method.
   */
  async setConfig(
    request: UpdateConfigRequest
  ): Promise<FluxPayPaymentReceipt> {
    FluxPay.assertAddress(request.treasury, "treasury");
    FluxPay.assertFeeRate(request.feeRate);

    const tx: ContractTransactionResponse = await this.contract.updateConfig(
      request.treasury,
      request.feeRate
    );

    return await tx.wait();
  }

  /**
   * Admin config update helper that returns a normalized config update result.
   */
  async setConfigAndParse(
    request: UpdateConfigRequest
  ): Promise<FluxPayConfigUpdateResult> {
    const receipt = await this.setConfig(request);
    return this.buildConfigUpdateResult(receipt);
  }

  /**
   * Backward-compatible admin config update method.
   */
  async updateConfig(
    treasury: string,
    feeRate: number
  ): Promise<FluxPayPaymentReceipt> {
    return await this.setConfig({
      treasury,
      feeRate,
    });
  }

  async pause(): Promise<FluxPayPaymentReceipt> {
    const tx: ContractTransactionResponse = await this.contract.pause();
    return await tx.wait();
  }

  async unpause(): Promise<FluxPayPaymentReceipt> {
    const tx: ContractTransactionResponse = await this.contract.unpause();
    return await tx.wait();
  }

  async owner(): Promise<string> {
    return await this.contract.owner();
  }

  async treasuryWallet(): Promise<string> {
    return await this.contract.treasuryWallet();
  }

  async feeRate(): Promise<bigint> {
    return await this.contract.feeRate();
  }

  async productionLocked(): Promise<boolean> {
    return await this.contract.productionLocked();
  }

  async paused(): Promise<boolean> {
    return await this.contract.paused();
  }

  async basisPointsDivisor(): Promise<bigint> {
    return await this.contract.BASIS_POINTS_DIVISOR();
  }

  async maxFeeRate(): Promise<bigint> {
    return await this.contract.MAX_FEE_RATE();
  }

  /**
   * Parse a transaction receipt and decode FluxPay-specific events.
   */
  parseReceipt(receipt: ContractTransactionReceipt | null): FluxPayParsedReceipt {
    if (receipt === null) {
      return {
        transactionHash: null,
        blockNumber: null,
        events: [],
        paymentReceived: [],
        configUpdated: [],
        productionLocked: [],
      };
    }

    return this.parseLogs(receipt.logs as LogLike[], {
      transactionHash: receipt.hash ?? null,
      blockNumber: receipt.blockNumber ?? null,
    });
  }

  /**
   * Parse raw logs or EventLog-like objects and decode FluxPay-specific events.
   */
  parseLogs(
    logs: readonly LogLike[],
    context?: {
      transactionHash?: string | null;
      blockNumber?: number | null;
    }
  ): FluxPayParsedReceipt {
    const events: FluxPayDecodedEvent[] = [];

    for (const log of logs) {
      const decoded = this.tryDecodeKnownEvent(log);

      if (decoded !== null) {
        events.push(decoded);
      }
    }

    const paymentReceived = events.filter(
      (event): event is FluxPayDecodedPaymentReceived =>
        event.name === "PaymentReceived"
    );

    const configUpdated = events.filter(
      (event): event is FluxPayDecodedConfigUpdated =>
        event.name === "ConfigUpdated"
    );

    const productionLocked = events.filter(
      (event): event is FluxPayDecodedProductionLocked =>
        event.name === "ProductionLocked"
    );

    return {
      transactionHash: context?.transactionHash ?? null,
      blockNumber: context?.blockNumber ?? null,
      events,
      paymentReceived,
      configUpdated,
      productionLocked,
    };
  }

  /**
   * Convenience method for extracting PaymentReceived events from a receipt.
   */
  parsePaymentReceived(
    receipt: ContractTransactionReceipt | null
  ): FluxPayDecodedPaymentReceived[] {
    return this.parseReceipt(receipt).paymentReceived;
  }

  /**
   * Convenience method for extracting ConfigUpdated events from a receipt.
   */
  parseConfigUpdated(
    receipt: ContractTransactionReceipt | null
  ): FluxPayDecodedConfigUpdated[] {
    return this.parseReceipt(receipt).configUpdated;
  }

  /**
   * Convenience method for extracting ProductionLocked events from raw logs.
   */
  parseProductionLockedLogs(
    logs: readonly LogLike[]
  ): FluxPayDecodedProductionLocked[] {
    return this.parseLogs(logs).productionLocked;
  }

  /**
   * Normalize any receipt into parsed transaction metadata.
   */
  normalizeReceipt(
    receipt: ContractTransactionReceipt | null
  ): FluxPayNormalizedTransaction {
    const parsed = this.parseReceipt(receipt);

    return {
      transactionHash: parsed.transactionHash,
      blockNumber: parsed.blockNumber,
      receipt,
      parsed,
    };
  }

  /**
   * Build a normalized payment result from a payment receipt.
   */
  buildPaymentResult(
    receipt: ContractTransactionReceipt | null
  ): FluxPayPaymentResult {
    const normalized = this.normalizeReceipt(receipt);

    if (normalized.parsed.paymentReceived.length !== 1) {
      throw new Error(
        `Expected exactly one PaymentReceived event, found ${normalized.parsed.paymentReceived.length}`
      );
    }

    return {
      ...normalized,
      payment: normalized.parsed.paymentReceived[0],
    };
  }

  /**
   * Build a normalized config update result from an admin update receipt.
   */
  buildConfigUpdateResult(
    receipt: ContractTransactionReceipt | null
  ): FluxPayConfigUpdateResult {
    const normalized = this.normalizeReceipt(receipt);

    if (normalized.parsed.configUpdated.length !== 1) {
      throw new Error(
        `Expected exactly one ConfigUpdated event, found ${normalized.parsed.configUpdated.length}`
      );
    }

    return {
      ...normalized,
      config: normalized.parsed.configUpdated[0],
    };
  }

  private tryDecodeKnownEvent(log: LogLike): FluxPayDecodedEvent | null {
    if (!log.topics || !log.data) {
      return null;
    }

    let parsed: LogDescription | null = null;

    try {
      parsed = this.contract.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
    } catch {
      return null;
    }

    if (parsed === null) {
      return null;
    }

    const logIndex = FluxPay.resolveLogIndex(log);
    const transactionHash = log.transactionHash ?? null;

    if (parsed.name === "PaymentReceived") {
      return {
        name: "PaymentReceived",
        buyer: parsed.args.buyer,
        token: parsed.args.token,
        amount: parsed.args.amount,
        fee: parsed.args.fee,
        logIndex,
        transactionHash,
      };
    }

    if (parsed.name === "ConfigUpdated") {
      return {
        name: "ConfigUpdated",
        treasuryWallet: parsed.args.treasuryWallet,
        feeRate: parsed.args.feeRate,
        logIndex,
        transactionHash,
      };
    }

    if (parsed.name === "ProductionLocked") {
      return {
        name: "ProductionLocked",
        logIndex,
        transactionHash,
      };
    }

    return null;
  }

  static toBigIntAmount(value: FluxPayAmount, fieldName = "amount"): bigint {
    if (typeof value === "bigint") {
      return value;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error(`${fieldName} must be finite`);
      }

      if (!Number.isInteger(value)) {
        throw new Error(`${fieldName} number input must be an integer`);
      }

      if (!Number.isSafeInteger(value)) {
        throw new Error(
          `${fieldName} number input must be a safe integer; use bigint or string instead`
        );
      }

      return BigInt(value);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed.length === 0) {
        throw new Error(`${fieldName} string input cannot be empty`);
      }

      if (!/^[0-9]+$/.test(trimmed)) {
        throw new Error(
          `${fieldName} string input must be an integer base-unit amount`
        );
      }

      return BigInt(trimmed);
    }

    throw new Error(`${fieldName} has unsupported amount type`);
  }

  static assertAddress(value: string, fieldName: string): void {
    if (!ethers.isAddress(value)) {
      throw new Error(`${fieldName} must be a valid EVM address`);
    }

    if (value === ethers.ZeroAddress) {
      throw new Error(`${fieldName} cannot be the zero address`);
    }
  }

  static assertFeeRate(value: number): void {
    if (!Number.isInteger(value)) {
      throw new Error("feeRate must be an integer");
    }

    if (value < 0) {
      throw new Error("feeRate cannot be negative");
    }

    if (value > 1000) {
      throw new Error("feeRate cannot exceed 1000 bps");
    }
  }

  private static resolveLogIndex(log: LogLike): number | null {
    if (typeof log.index === "number") {
      return log.index;
    }

    if (typeof log.logIndex === "number") {
      return log.logIndex;
    }

    return null;
  }
}