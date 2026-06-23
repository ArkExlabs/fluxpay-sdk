import { ethers, Contract, type Signer } from "ethers";

export class FluxPay {
  private contract: Contract;
  private signer: Signer;

  /**
   * @param contractAddress - The deployed contract or proxy address
   * @param abi - The contract ABI from artifacts
   * @param signer - The ethers Signer instance
   */
  constructor(contractAddress: string, abi: any, signer: Signer) {
    this.contract = new Contract(contractAddress, abi, signer);
    this.signer = signer;
  }

  getContract() {
    return this.contract;
  }

  getSigner() {
    return this.signer;
  }

  // Initialize the contract. For proxy deployments, this is normally called
  // by deployProxy and should not be called manually again.
  async initialize(owner: string, treasury: string, feeRate: number) {
    try {
      const currentOwner = await this.contract.owner();

      if (currentOwner !== ethers.ZeroAddress) {
        throw new Error("Contract already initialized");
      }

      const tx = await this.contract.initialize(owner, treasury, feeRate);
      return await tx.wait();
    } catch (error) {
      console.error("Initialization failed:", error);
      throw error;
    }
  }

  // Pay with native ETH.
  async payWithETH(projectCreator: string, amount: string | bigint) {
    const value = ethers.toBigInt(amount);
    const tx = await this.contract.payWithETH(projectCreator, { value });
    return await tx.wait();
  }

  // Pay with ERC20 tokens.
  async payWithToken(
    token: string,
    amount: string | bigint,
    projectCreator: string
  ) {
    const amountBigInt = ethers.toBigInt(amount);
    const tx = await this.contract.payWithToken(
      token,
      amountBigInt,
      projectCreator
    );
    return await tx.wait();
  }

  // Update treasury and fee configuration.
  async updateConfig(treasury: string, feeRate: number) {
    const tx = await this.contract.updateConfig(treasury, feeRate);
    return await tx.wait();
  }

  // Emergency pause. Owner only.
  async pause() {
    const tx = await this.contract.pause();
    return await tx.wait();
  }

  // Emergency unpause. Owner only.
  async unpause() {
    const tx = await this.contract.unpause();
    return await tx.wait();
  }

  async owner() {
    return await this.contract.owner();
  }

  async treasuryWallet() {
    return await this.contract.treasuryWallet();
  }

  async feeRate() {
    return await this.contract.feeRate();
  }

  async productionLocked() {
    return await this.contract.productionLocked();
  }

  async paused() {
    return await this.contract.paused();
  }
}