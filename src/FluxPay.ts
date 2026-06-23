import { ethers, Contract, type Signer } from "ethers";

export class FluxPay {
  private contract: Contract;
  private signer: Signer;

  /**
   * @param contractAddress - The deployed contract address
   * @param abi - The contract ABI (from artifacts)
   * @param signer - The ethers Signer instance
   */
  constructor(contractAddress: string, abi: any, signer: Signer) {
    this.contract = new Contract(contractAddress, abi, signer);
    this.signer = signer;
  }

  // Initialize the contract (only if owner is not set)
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

  // Pay with native ETH
  async payWithETH(projectCreator: string, amount: string | bigint) {
    const value = ethers.toBigInt(amount);
    const tx = await this.contract.payWithETH(projectCreator, { value });
    return await tx.wait();
  }

  // Pay with ERC20 tokens
  async payWithToken(token: string, amount: string | bigint, projectCreator: string) {
    const amountBigInt = ethers.toBigInt(amount);
    const tx = await this.contract.payWithToken(token, amountBigInt, projectCreator);
    return await tx.wait();
  }

  // Update configuration
  async updateConfig(treasury: string, feeRate: number) {
    const tx = await this.contract.updateConfig(treasury, feeRate);
    return await tx.wait();
  }
}