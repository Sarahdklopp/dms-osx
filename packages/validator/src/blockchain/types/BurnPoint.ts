import { defaultAbiCoder } from "@ethersproject/abi";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { arrayify } from "@ethersproject/bytes";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/keccak256";
import { BranchSignature } from "./BranchSignature";
import { JSONValidator } from "./JSONValidator";

export enum BurnPointType {
    PhoneNumber = 0,
    Account = 1,
}

export class BurnPoint {
    public type: BurnPointType;
    public account: string;
    public amount: BigNumber;

    constructor(type: BurnPointType, account: string, amount: BigNumber) {
        this.type = type;
        this.account = account;
        this.amount = BigNumber.from(amount);
    }

    public static reviver(key: string, value: any): any {
        if (key !== "") return value;
        JSONValidator.isValidOtherwiseThrow("BurnPoint", value);
        if (value.type === BurnPointType.PhoneNumber) JSONValidator.verifyHash(value.account);
        else JSONValidator.verifyAddress(value.account);
        JSONValidator.verifyNumber(value.amount);
        return new BurnPoint(value.type, value.account, BigNumber.from(value.amount));
    }

    public toJSON(): any {
        return {
            type: this.type,
            account: this.account,
            amount: this.amount.toString(),
        };
    }

    public clone(): BurnPoint {
        return new BurnPoint(this.type, this.account, this.amount);
    }

    public computeHash(): string {
        const encodedData =
            this.type === 0
                ? defaultAbiCoder.encode(
                      ["uint256", "address", "bytes32", "uint256"],
                      [this.type, AddressZero, this.account, this.amount]
                  )
                : defaultAbiCoder.encode(
                      ["uint256", "address", "bytes32", "uint256"],
                      [this.type, this.account, HashZero, this.amount]
                  );
        return keccak256(encodedData);
    }
}

export class BurnPointBranch {
    static MAX_ITEM_COUNT: number = 64;
    public items: BurnPoint[];

    constructor(items?: BurnPoint[], signature?: string[]) {
        this.items = items !== undefined ? items : [];
    }

    public static reviver(key: string, value: any): any {
        if (key !== "") return value;
        JSONValidator.isValidOtherwiseThrow("BurnPointBranch", value);
        const purchases: BurnPoint[] = [];
        for (const elem of value.items) {
            purchases.push(BurnPoint.reviver("", elem));
        }
        return new BurnPointBranch(purchases, value.signatures);
    }

    public toJSON(): any {
        return {
            items: this.items,
        };
    }

    public computeHash(slot: bigint): string {
        if (this.items.length > 0)
            return keccak256(
                defaultAbiCoder.encode(
                    ["uint256", "uint256", "bytes32[]"],
                    [slot, this.items.length, this.items.map((m) => m.computeHash())]
                )
            );
        else return HashZero;
    }

    public async sign(signer: Signer, slot: bigint) {
        return signer.signMessage(arrayify(this.computeHash(slot)));
    }
}

export class BurnPointRoot {
    public branches: BurnPointBranch[];
    public signatures: BranchSignature[];

    constructor(branches?: BurnPointBranch[], signatures?: BranchSignature[]) {
        this.branches = branches !== undefined ? branches : [];
        this.signatures = signatures !== undefined ? signatures : [];
    }

    public static reviver(key: string, value: any): any {
        if (key !== "") return value;
        JSONValidator.isValidOtherwiseThrow("BurnPointRoot", value);
        const branches: BurnPointBranch[] = [];
        for (const elem of value.branches) {
            branches.push(BurnPointBranch.reviver("", elem));
        }
        const signatures: BranchSignature[] = [];
        for (const elem of value.signatures) {
            signatures.push(BranchSignature.reviver("", elem));
        }
        return new BurnPointRoot(branches, signatures);
    }

    public toJSON(): any {
        return {
            branches: this.branches,
            signatures: this.signatures,
        };
    }

    public computeHash(slot: bigint): string {
        if (this.branches.length > 0)
            return keccak256(
                defaultAbiCoder.encode(
                    ["uint256", "uint256", "bytes32[]"],
                    [slot, this.branches.length, this.branches.map((m) => m.computeHash(slot))]
                )
            );
        else return HashZero;
    }

    public addItem(data: BurnPoint) {
        let branch = this.branches.find((m) => m.items.length < BurnPointBranch.MAX_ITEM_COUNT);
        if (branch === undefined) {
            branch = new BurnPointBranch();
            this.branches.push(branch);
        }
        branch.items.push(data);
    }
}
