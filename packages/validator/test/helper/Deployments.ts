import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import { ethers, upgrades } from "hardhat";

import { BaseContract, Wallet } from "ethers";

import { Amount, BOACoin } from "../../src/common/Amount";
import { HardhatAccount } from "../../src/HardhatAccount";
import { ContractUtils } from "../../src/utils/ContractUtils";

import {
    CurrencyRate,
    Ledger,
    LoyaltyBurner,
    LoyaltyConsumer,
    LoyaltyExchanger,
    LoyaltyProvider,
    LoyaltyTransfer,
    PhoneLinkCollection,
    Shop,
    StorePurchase,
    TestKIOS,
    Validator,
} from "../../typechain-types";

interface IShopData {
    shopId: string;
    name: string;
    currency: string;
    wallet: Wallet;
}

interface IDeployedContract {
    name: string;
    address: string;
    contract: BaseContract;
}

export interface IAccount {
    deployer: Wallet;
    owner: Wallet;
    certifier: Wallet;
    foundation: Wallet;
    settlements: Wallet;
    fee: Wallet;
    validators: Wallet[];
    linkValidators: Wallet[];
    certifiers: Wallet[];
    purchaseManager: Wallet;
    users: Wallet[];
    shops: Wallet[];
    tokenOwners: Wallet[];
    tokenRequire: number;
}

type FnDeployer = (accounts: IAccount, deployment: Deployments) => void;

export class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public accounts: IAccount;
    public shops: IShopData[];

    constructor() {
        this.deployments = new Map<string, IDeployedContract>();
        this.shops = [];

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
        const [
            deployer,
            owner,
            foundation,
            settlements,
            fee,
            certifier,
            certifier01,
            certifier02,
            certifier03,
            certifier04,
            certifier05,
            certifier06,
            certifier07,
            certifier08,
            certifier09,
            certifier10,
            validator01,
            validator02,
            validator03,
            validator04,
            validator05,
            validator06,
            validator07,
            validator08,
            validator09,
            validator10,
            validator11,
            validator12,
            validator13,
            validator14,
            validator15,
            validator16,
            linkValidator1,
            linkValidator2,
            linkValidator3,
            purchaseManager,
            user01,
            user02,
            user03,
            user04,
            user05,
            user06,
            user07,
            user08,
            user09,
            user10,
            shop01,
            shop02,
            shop03,
            shop04,
            shop05,
            shop06,
            shop07,
            shop08,
            shop09,
            shop10,
        ] = raws;

        this.accounts = {
            deployer,
            owner,
            certifier,
            foundation,
            settlements,
            fee,
            validators: [
                validator01,
                validator02,
                validator03,
                validator04,
                validator05,
                validator06,
                validator07,
                validator08,
                validator09,
                validator10,
                validator11,
                validator12,
                validator13,
                validator14,
                validator15,
                validator16,
            ],
            linkValidators: [linkValidator1, linkValidator2, linkValidator3],
            certifiers: [
                certifier01,
                certifier02,
                certifier03,
                certifier04,
                certifier05,
                certifier06,
                certifier07,
                certifier08,
                certifier09,
                certifier10,
            ],
            purchaseManager,
            users: [user01, user02, user03, user04, user05, user06, user07, user08, user09, user10],
            shops: [shop01, shop02, shop03, shop04, shop05, shop06, shop07, shop08, shop09, shop10],

            tokenOwners: [certifier01, certifier02, certifier03],
            tokenRequire: 2,
        };
    }

    public setShopData(shopData: IShopData[]) {
        this.shops = [];
        this.shops.push(...shopData);
    }

    public addContract(name: string, address: string, contract: BaseContract) {
        this.deployments.set(name, {
            name,
            address,
            contract,
        });
    }

    public getContract(name: string): BaseContract | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.contract;
        } else {
            return undefined;
        }
    }

    public getContractAddress(name: string): string | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.address;
        } else {
            return undefined;
        }
    }

    public async doDeploy() {
        const deployers: FnDeployer[] = [
            deployToken,
            deployPhoneLink,
            deployValidator,
            deployCurrencyRate,
            deployLoyaltyProvider,
            deployLoyaltyConsumer,
            deployLoyaltyExchanger,
            deployLoyaltyBurner,
            deployLoyaltyTransfer,
            deployShop,
            deployLedger,
            deployStorePurchase,
        ];
        for (const elem of deployers) {
            try {
                await elem(this.accounts, this);
            } catch (error) {
                console.log(error);
            }
        }
    }
}

async function deployPhoneLink(accounts: IAccount, deployment: Deployments) {
    const contractName = "PhoneLinkCollection";
    console.log(`Deploy ${contractName}...`);
    const factory = await ethers.getContractFactory("PhoneLinkCollection");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [accounts.linkValidators.map((m) => m.address)],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as PhoneLinkCollection;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployToken(accounts: IAccount, deployment: Deployments) {
    const contractName = "TestKIOS";
    console.log(`Deploy ${contractName}...`);

    const factory = await ethers.getContractFactory("TestKIOS");
    const contract = (await factory.connect(accounts.deployer).deploy(accounts.owner.address)) as TestKIOS;
    await contract.deployed();
    await contract.deployTransaction.wait();

    const balance = await contract.balanceOf(accounts.owner.address);
    console.log(`TestKIOS token's owner: ${accounts.owner.address}`);
    console.log(`TestKIOS token's balance of owner: ${new BOACoin(balance).toDisplayString(true, 2)}`);

    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);

    {
        const assetAmount = Amount.make(100_000_000, 18);
        const tx1 = await contract.connect(accounts.owner).transfer(accounts.foundation.address, assetAmount.value);
        console.log(`Transfer token to foundation (tx: ${tx1.hash})...`);
        await tx1.wait();

        const userAmount = Amount.make(200_000, 18);
        const tx2 = await contract.connect(accounts.owner).multiTransfer(
            accounts.users.map((m) => m.address),
            userAmount.value
        );
        console.log(`Transfer token to users (tx: ${tx2.hash})...`);
        await tx2.wait();

        const tx3 = await contract.connect(accounts.owner).multiTransfer(
            accounts.shops.map((m) => m.address),
            userAmount.value
        );
        console.log(`Transfer token to shops (tx: ${tx3.hash})...`);
        await tx3.wait();
    }
}

async function deployValidator(accounts: IAccount, deployment: Deployments) {
    const contractName = "Validator";
    console.log(`Deploy ${contractName}...`);
    if (deployment.getContract("TestKIOS") === undefined) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("Validator");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [await deployment.getContractAddress("TestKIOS"), accounts.validators.map((m) => m.address)],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as Validator;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);

    {
        const amount = Amount.make(200_000, 18);
        const depositedToken = Amount.make(100_000, 18);

        for (const elem of accounts.validators) {
            const tx1 = await (deployment.getContract("TestKIOS") as TestKIOS)
                .connect(accounts.owner)
                .transfer(elem.address, amount.value);
            console.log(`Transfer token to validator (tx: ${tx1.hash})...`);
            await tx1.wait();

            const tx2 = await (deployment.getContract("TestKIOS") as TestKIOS)
                .connect(elem)
                .approve(contract.address, depositedToken.value);
            console.log(`Approve validator's amount (tx: ${tx2.hash})...`);
            await tx2.wait();

            const tx3 = await contract.connect(elem).deposit(depositedToken.value);
            console.log(`Deposit validator's amount (tx: ${tx3.hash})...`);
            await tx3.wait();
        }
    }
}

async function deployCurrencyRate(accounts: IAccount, deployment: Deployments) {
    const contractName = "CurrencyRate";
    console.log(`Deploy ${contractName}...`);
    if (deployment.getContract("Validator") === undefined || deployment.getContract("TestKIOS") === undefined) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("CurrencyRate");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [
            await deployment.getContractAddress("Validator"),
            await (deployment.getContract("TestKIOS") as TestKIOS).symbol(),
        ],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as CurrencyRate;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);

    {
        const multiple = await contract.multiple();
        const height = 0;
        const rates = [
            {
                symbol: "KIOS",
                rate: multiple.mul(150),
            },
            {
                symbol: "usd",
                rate: multiple.mul(1000),
            },
            {
                symbol: "jpy",
                rate: multiple.mul(10),
            },
        ];
        const message = ContractUtils.getCurrencyMessage(height, rates);
        const signatures = accounts.validators.map((m) => ContractUtils.signMessage(m, message));
        const tx1 = await contract.connect(accounts.validators[0]).set(height, rates, signatures);
        await tx1.wait();
    }
}

async function deployLoyaltyProvider(accounts: IAccount, deployment: Deployments) {
    const contractName = "LoyaltyProvider";
    console.log(`Deploy ${contractName}...`);
    if (
        deployment.getContract("Validator") === undefined ||
        deployment.getContract("PhoneLinkCollection") === undefined ||
        deployment.getContract("CurrencyRate") === undefined
    ) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("LoyaltyProvider");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [
            await deployment.getContractAddress("Validator"),
            await deployment.getContractAddress("PhoneLinkCollection"),
            await deployment.getContractAddress("CurrencyRate"),
        ],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as LoyaltyProvider;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployLoyaltyConsumer(accounts: IAccount, deployment: Deployments) {
    const contractName = "LoyaltyConsumer";
    console.log(`Deploy ${contractName}...`);
    if (deployment.getContract("CurrencyRate") === undefined) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("LoyaltyConsumer");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [await deployment.getContractAddress("CurrencyRate")],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as LoyaltyConsumer;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployLoyaltyExchanger(accounts: IAccount, deployment: Deployments) {
    const contractName = "LoyaltyExchanger";
    console.log(`Deploy ${contractName}...`);
    if (
        deployment.getContract("PhoneLinkCollection") === undefined ||
        deployment.getContract("CurrencyRate") === undefined
    ) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("LoyaltyExchanger");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [
            await deployment.getContractAddress("PhoneLinkCollection"),
            await deployment.getContractAddress("CurrencyRate"),
        ],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as LoyaltyExchanger;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployLoyaltyBurner(accounts: IAccount, deployment: Deployments) {
    const contractName = "LoyaltyBurner";
    console.log(`Deploy ${contractName}...`);
    if (
        deployment.getContract("Validator") === undefined ||
        deployment.getContract("PhoneLinkCollection") === undefined
    ) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("LoyaltyBurner");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [await deployment.getContractAddress("Validator"), await deployment.getContractAddress("PhoneLinkCollection")],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as LoyaltyBurner;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployLoyaltyTransfer(accounts: IAccount, deployment: Deployments) {
    const contractName = "LoyaltyTransfer";
    console.log(`Deploy ${contractName}...`);

    const factory = await ethers.getContractFactory("LoyaltyTransfer");
    const contract = (await upgrades.deployProxy(factory.connect(accounts.deployer), [], {
        initializer: "initialize",
        kind: "uups",
    })) as LoyaltyTransfer;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function deployShop(accounts: IAccount, deployment: Deployments) {
    const contractName = "Shop";
    console.log(`Deploy ${contractName}...`);
    if (
        deployment.getContract("CurrencyRate") === undefined ||
        deployment.getContract("LoyaltyProvider") === undefined ||
        deployment.getContract("LoyaltyConsumer") === undefined
    ) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("Shop");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [
            await deployment.getContractAddress("CurrencyRate"),
            await deployment.getContractAddress("LoyaltyProvider"),
            await deployment.getContractAddress("LoyaltyConsumer"),
        ],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as Shop;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);

    const tx1 = await (deployment.getContract("LoyaltyProvider") as LoyaltyProvider)
        .connect(accounts.deployer)
        .setShop(contract.address);
    console.log(`Set address of LoyaltyProvider (tx: ${tx1.hash})...`);
    await tx1.wait();

    const tx2 = await (deployment.getContract("LoyaltyConsumer") as LoyaltyConsumer)
        .connect(accounts.deployer)
        .setShop(contract.address);
    console.log(`Set address of LoyaltyConsumer (tx: ${tx2.hash})...`);
    await tx2.wait();

    console.log(`Deployed ${contractName} to ${contract.address}`);

    {
        for (const shop of deployment.shops) {
            const nonce = await contract.nonceOf(shop.wallet.address);
            const signature = await ContractUtils.signShop(shop.wallet, shop.shopId, nonce);
            const tx3 = await contract
                .connect(shop.wallet)
                .add(shop.shopId, shop.name, shop.currency, shop.wallet.address, signature);
            console.log(`Add shop data (tx: ${tx3.hash})...`);
            await tx3.wait();
        }
    }
}

async function deployLedger(accounts: IAccount, deployment: Deployments) {
    const contractName = "Ledger";
    console.log(`Deploy ${contractName}...`);
    if (
        deployment.getContract("TestKIOS") === undefined ||
        deployment.getContract("PhoneLinkCollection") === undefined ||
        deployment.getContract("CurrencyRate") === undefined ||
        deployment.getContract("LoyaltyProvider") === undefined ||
        deployment.getContract("LoyaltyConsumer") === undefined ||
        deployment.getContract("LoyaltyExchanger") === undefined ||
        deployment.getContract("LoyaltyBurner") === undefined ||
        deployment.getContract("LoyaltyTransfer") === undefined
    ) {
        console.error("Contract is not deployed!");
        return;
    }

    const factory = await ethers.getContractFactory("Ledger");
    const contract = (await upgrades.deployProxy(
        factory.connect(accounts.deployer),
        [
            accounts.foundation.address,
            accounts.settlements.address,
            accounts.fee.address,
            await deployment.getContractAddress("TestKIOS"),
            await deployment.getContractAddress("PhoneLinkCollection"),
            await deployment.getContractAddress("CurrencyRate"),
            await deployment.getContractAddress("LoyaltyProvider"),
            await deployment.getContractAddress("LoyaltyConsumer"),
            await deployment.getContractAddress("LoyaltyExchanger"),
            await deployment.getContractAddress("LoyaltyBurner"),
            await deployment.getContractAddress("LoyaltyTransfer"),
        ],
        {
            initializer: "initialize",
            kind: "uups",
        }
    )) as Ledger;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);

    const tx1 = await (deployment.getContract("LoyaltyProvider") as LoyaltyProvider)
        .connect(accounts.deployer)
        .setLedger(contract.address);
    console.log(`Set address of LoyaltyProvider (tx: ${tx1.hash})...`);
    await tx1.wait();

    const tx2 = await (deployment.getContract("LoyaltyConsumer") as LoyaltyConsumer)
        .connect(accounts.deployer)
        .setLedger(contract.address);
    console.log(`Set address of LoyaltyConsumer (tx: ${tx2.hash})...`);
    await tx2.wait();

    const tx3 = await (deployment.getContract("LoyaltyExchanger") as LoyaltyExchanger)
        .connect(accounts.deployer)
        .setLedger(contract.address);
    console.log(`Set address of LoyaltyExchanger (tx: ${tx3.hash})...`);
    await tx3.wait();

    const tx4 = await (deployment.getContract("LoyaltyBurner") as LoyaltyBurner)
        .connect(accounts.deployer)
        .setLedger(contract.address);
    console.log(`Set address of LoyaltyBurner (tx: ${tx4.hash})...`);
    await tx4.wait();

    const tx5 = await (deployment.getContract("LoyaltyTransfer") as LoyaltyBurner)
        .connect(accounts.deployer)
        .setLedger(contract.address);
    console.log(`Set address of LoyaltyBurner (tx: ${tx5.hash})...`);
    await tx5.wait();

    console.log(`Deployed ${contractName} to ${contract.address}`);

    {
        const assetAmount = Amount.make(100_000_000, 18);
        const tx11 = await (deployment.getContract("TestKIOS") as TestKIOS)
            .connect(accounts.foundation)
            .approve(contract.address, assetAmount.value);
        console.log(`Approve foundation's amount (tx: ${tx11.hash})...`);
        await tx11.wait();

        const tx12 = await contract.connect(accounts.foundation).deposit(assetAmount.value);
        console.log(`Deposit foundation's amount (tx: ${tx12.hash})...`);
        await tx12.wait();
    }
}

async function deployStorePurchase(accounts: IAccount, deployment: Deployments) {
    const contractName = "StorePurchase";
    console.log(`Deploy ${contractName}...`);
    const factory = await ethers.getContractFactory("StorePurchase");
    const contract = (await upgrades.deployProxy(factory.connect(accounts.purchaseManager), [], {
        initializer: "initialize",
        kind: "uups",
    })) as StorePurchase;
    await contract.deployed();
    await contract.deployTransaction.wait();
    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}
