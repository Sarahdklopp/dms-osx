/**
 *  Define the configuration objects that are used through the application
 *
 *  Copyright:
 *      Copyright (c) 2023 BOSAGORA Foundation All rights reserved.
 *
 *  License:
 *       MIT License. See LICENSE for details.
 */

import { ArgumentParser } from "argparse";
import { Utils } from "../utils/Utils";

import extend from "extend";
import fs from "fs";
import ip from "ip";
import path from "path";
import { readYamlEnvSync } from "yaml-env-defaults";

/**
 * Main config
 */
export class Config implements IConfig {
    /**
     * Server config
     */
    public server: ServerConfig;

    /**
     * Database config
     */
    public database: DatabaseConfig;

    /**
     * Logging config
     */
    public logging: LoggingConfig;

    /**
     * Scheduler
     */
    public scheduler: SchedulerConfig;

    public contracts: ContractsConfig;

    public setting: Setting;

    public validator: Validator;

    /**
     * Constructor
     */
    constructor() {
        this.server = new ServerConfig();
        this.database = new DatabaseConfig();
        this.logging = new LoggingConfig();
        this.scheduler = new SchedulerConfig();
        this.contracts = new ContractsConfig();
        this.setting = new Setting();
        this.validator = new Validator();
    }

    /**
     * Parses the command line arguments, Reads from the configuration file
     */
    public static createWithArgument(): Config {
        // Parse the arguments
        const parser = new ArgumentParser();
        parser.add_argument("-c", "--config", {
            default: "config.yaml",
            help: "Path to the config file to use",
        });
        const args = parser.parse_args();

        let configPath = path.resolve(Utils.getInitCWD(), args.config);
        if (!fs.existsSync(configPath)) configPath = path.resolve(Utils.getInitCWD(), "config", "config.yaml");
        if (!fs.existsSync(configPath)) {
            console.error(`Config file '${configPath}' does not exists`);
            process.exit(1);
        }

        const cfg = new Config();
        try {
            cfg.readFromFile(configPath);
        } catch (error: any) {
            // Logging setup has not been completed and is output to the console.
            console.error(error.message);

            // If the process fails to read the configuration file, the process exits.
            process.exit(1);
        }
        return cfg;
    }

    /**
     * Reads from file
     * @param config_file The file name of configuration
     */
    public readFromFile(config_file: string) {
        const cfg = readYamlEnvSync([path.resolve(Utils.getInitCWD(), config_file)], (key) => {
            return (process.env || {})[key];
        }) as IConfig;
        this.server.readFromObject(cfg.server);
        this.database.readFromObject(cfg.database);
        this.logging.readFromObject(cfg.logging);
        this.scheduler.readFromObject(cfg.scheduler);
        this.contracts.readFromObject(cfg.contracts);
        this.setting.readFromObject(cfg.setting);
        this.validator.readFromObject(cfg.validator);
    }
}

/**
 * Server config
 */
export class ServerConfig implements IServerConfig {
    /**
     * THe address to which we bind
     */
    public address: string;

    /**
     * The port on which we bind
     */
    public port: number;

    /**
     * Constructor
     * @param address The address to which we bind
     * @param port The port on which we bind
     */
    constructor(address?: string, port?: number) {
        const conf = extend(true, {}, ServerConfig.defaultValue());
        extend(true, conf, { address, port });

        if (!ip.isV4Format(conf.address) && !ip.isV6Format(conf.address)) {
            console.error(`${conf.address}' is not appropriate to use as an IP address.`);
            process.exit(1);
        }

        this.address = conf.address;
        this.port = conf.port;
    }

    /**
     * Returns default value
     */
    public static defaultValue(): IServerConfig {
        return {
            address: "127.0.0.1",
            port: 3000,
        };
    }

    /**
     * Reads from Object
     * @param config The object of IServerConfig
     */
    public readFromObject(config: IServerConfig) {
        const conf = extend(true, {}, ServerConfig.defaultValue());
        extend(true, conf, config);

        if (!ip.isV4Format(conf.address) && !ip.isV6Format(conf.address)) {
            console.error(`${conf.address}' is not appropriate to use as an IP address.`);
            process.exit(1);
        }
        this.address = conf.address;
        this.port = conf.port;
    }
}

/**
 * Database config
 */
export class DatabaseConfig implements IDatabaseConfig {
    /**
     * The host of mysql
     */
    host: string;

    /**
     * The user of mysql
     */
    user: string;

    /**
     * The password of mysql
     */
    password: string;

    /**
     * The database name
     */
    database: string;

    scheme: string;

    /**
     * The host database port
     */
    port: number;

    /**
     * number of milliseconds to wait before timing out when connecting a new client
     * by default this is 0 which means no timeout
     */
    connectionTimeoutMillis: number;

    /**
     * maximum number of clients the pool should contain
     * by default this is set to 10.
     */
    max: number;

    /**
     * Constructor
     * @param host Postgresql database host
     * @param user Postgresql database user
     * @param password Postgresql database password
     * @param database Postgresql database name
     * @param scheme
     * @param port Postgresql database port
     * @param connectionTimeoutMillis Number of milliseconds to wait before
     * timing out when connecting a new client.
     * By default this is 0 which means no timeout.
     * @param max Number of milliseconds to wait before timing out when
     * connecting a new client by default this is 0 which means no timeout.
     */
    constructor(
        host?: string,
        user?: string,
        password?: string,
        database?: string,
        scheme?: string,
        port?: number,
        connectionTimeoutMillis?: number,
        max?: number
    ) {
        const conf = extend(true, {}, DatabaseConfig.defaultValue());
        extend(true, conf, {
            host,
            user,
            password,
            database,
            scheme,
            port,
            connectionTimeoutMillis,
            max,
        });
        this.host = conf.host;
        this.user = conf.user;
        this.password = conf.password;
        this.database = conf.database;
        this.scheme = conf.scheme;
        this.port = conf.port;
        this.connectionTimeoutMillis = conf.connectionTimeoutMillis;
        this.max = conf.max;
    }

    /**
     * Returns default value
     */
    public static defaultValue(): IDatabaseConfig {
        return {
            host: "localhost",
            user: "root",
            password: "12345678",
            database: "relay",
            scheme: "",
            port: 5432,
            connectionTimeoutMillis: 2000,
            max: 20,
        };
    }

    /**
     * Reads from Object
     * @param config The object of IDatabaseConfig
     */
    public readFromObject(config: IDatabaseConfig) {
        const conf = extend(true, {}, DatabaseConfig.defaultValue());
        extend(true, conf, config);
        this.host = conf.host;
        this.user = conf.user;
        this.password = conf.password;
        this.database = conf.database;
        this.scheme = conf.scheme;
        this.port = conf.port;
        this.connectionTimeoutMillis = conf.connectionTimeoutMillis;
        this.max = conf.max;
    }
}

/**
 * Logging config
 */
export class ContractsConfig implements IContractsConfig {
    public tokenAddress: string;
    public ledgerAddress: string;
    public providerAddress: string;
    public consumerAddress: string;
    public exchangerAddress: string;
    public phoneLinkerAddress: string;
    public shopAddress: string;
    public currencyRateAddress: string;
    public purchaseAddress: string;

    /**
     * Constructor
     */
    constructor() {
        const defaults = ContractsConfig.defaultValue();

        this.tokenAddress = defaults.tokenAddress;
        this.ledgerAddress = defaults.ledgerAddress;
        this.providerAddress = defaults.providerAddress;
        this.consumerAddress = defaults.consumerAddress;
        this.exchangerAddress = defaults.exchangerAddress;
        this.phoneLinkerAddress = defaults.phoneLinkerAddress;
        this.shopAddress = defaults.shopAddress;
        this.currencyRateAddress = defaults.currencyRateAddress;
        this.purchaseAddress = defaults.purchaseAddress;
    }

    /**
     * Returns default value
     */
    public static defaultValue(): IContractsConfig {
        return {
            tokenAddress: process.env.TOKEN_CONTRACT_ADDRESS || "",
            ledgerAddress: process.env.LEDGER_CONTRACT_ADDRESS || "",
            providerAddress: process.env.LOYALTY_PROVIDER_CONTRACT_ADDRESS || "",
            consumerAddress: process.env.LOYALTY_CONSUMER_CONTRACT_ADDRESS || "",
            exchangerAddress: process.env.LOYALTY_EXCHANGER_CONTRACT_ADDRESS || "",
            phoneLinkerAddress: process.env.PHONE_LINKER_CONTRACT_ADDRESS || "",
            shopAddress: process.env.SHOP_CONTRACT_ADDRESS || "",
            currencyRateAddress: process.env.CURRENCY_RATE_CONTRACT_ADDRESS || "",
            purchaseAddress: process.env.STORE_PURCHASE_CONTRACT_ADDRESS || "",
        };
    }

    /**
     * Reads from Object
     * @param config The object of ILoggingConfig
     */
    public readFromObject(config: IContractsConfig) {
        if (config.tokenAddress !== undefined) this.tokenAddress = config.tokenAddress;
        if (config.ledgerAddress !== undefined) this.ledgerAddress = config.ledgerAddress;
        if (config.providerAddress !== undefined) this.providerAddress = config.providerAddress;
        if (config.consumerAddress !== undefined) this.consumerAddress = config.consumerAddress;
        if (config.exchangerAddress !== undefined) this.exchangerAddress = config.exchangerAddress;
        if (config.phoneLinkerAddress !== undefined) this.phoneLinkerAddress = config.phoneLinkerAddress;
        if (config.shopAddress !== undefined) this.shopAddress = config.shopAddress;
        if (config.currencyRateAddress !== undefined) this.currencyRateAddress = config.currencyRateAddress;
        if (config.purchaseAddress !== undefined) this.purchaseAddress = config.purchaseAddress;
    }
}

/**
 * Logging config
 */
export class LoggingConfig implements ILoggingConfig {
    /**
     * The level of logging
     */
    public level: string;

    /**
     * Constructor
     */
    constructor() {
        const defaults = LoggingConfig.defaultValue();
        this.level = defaults.level;
    }

    /**
     * Returns default value
     */
    public static defaultValue(): ILoggingConfig {
        return {
            level: "info",
        };
    }

    /**
     * Reads from Object
     * @param config The object of ILoggingConfig
     */
    public readFromObject(config: ILoggingConfig) {
        if (config.level) this.level = config.level;
    }
}

/**
 * Information on the scheduler.
 */
export class SchedulerConfig implements ISchedulerConfig {
    /**
     * Whether the scheduler is used or not
     */
    public enable: boolean;

    /**
     * Container for scheduler items
     */
    public items: ISchedulerItemConfig[];

    /**
     * Constructor
     */
    constructor() {
        const defaults = SchedulerConfig.defaultValue();
        this.enable = defaults.enable;
        this.items = defaults.items;
    }

    /**
     * Returns default value
     */
    public static defaultValue(): ISchedulerConfig {
        return {
            enable: false,
            items: [
                {
                    name: "node",
                    enable: false,
                    expression: "*/1 * * * * *",
                },
            ],
        } as unknown as ISchedulerConfig;
    }

    /**
     * Reads from Object
     * @param config The object of ILoggingConfig
     */
    public readFromObject(config: ISchedulerConfig) {
        this.enable = false;
        this.items = [];
        if (config === undefined) return;
        if (config.enable !== undefined) this.enable = config.enable;
        if (config.items !== undefined) this.items = config.items;
    }

    public getScheduler(name: string): ISchedulerItemConfig | undefined {
        return this.items.find((m) => m.name === name);
    }
}

export class Setting implements ISetting {
    public ipfs_gateway_url: string;
    public waitedProvide: number;
    public nptServer: string;
    public nptInterval: number;
    public SECONDS_PER_SLOT: number;
    public SLOTS_PER_EPOCH: number;
    public GENESIS_TIME: bigint;

    /**
     * Constructor
     */
    constructor() {
        const defaults = Setting.defaultValue();
        this.ipfs_gateway_url = defaults.ipfs_gateway_url;
        this.waitedProvide = defaults.waitedProvide;
        this.nptServer = defaults.nptServer;
        this.nptInterval = defaults.nptInterval;
        this.SECONDS_PER_SLOT = defaults.SECONDS_PER_SLOT;
        this.SLOTS_PER_EPOCH = defaults.SLOTS_PER_EPOCH;
        this.GENESIS_TIME = BigInt(defaults.GENESIS_TIME);
    }

    public readFromObject(config: ISetting) {
        if (config.ipfs_gateway_url !== undefined) this.ipfs_gateway_url = config.ipfs_gateway_url;
        if (config.waitedProvide !== undefined) this.waitedProvide = config.waitedProvide;
        if (config.nptServer !== undefined) this.nptServer = config.nptServer;
        if (config.nptInterval !== undefined) this.nptInterval = config.nptInterval;
        if (config.SECONDS_PER_SLOT !== undefined) this.SECONDS_PER_SLOT = config.SECONDS_PER_SLOT;
        if (config.SLOTS_PER_EPOCH !== undefined) this.SLOTS_PER_EPOCH = config.SLOTS_PER_EPOCH;
        if (config.GENESIS_TIME !== undefined) this.GENESIS_TIME = BigInt(config.GENESIS_TIME);
    }

    /**
     * Returns default value
     */
    public static defaultValue(): ISetting {
        return {
            ipfs_gateway_url: "",
            waitedProvide: 86400 * 8,
            SECONDS_PER_SLOT: 12,
            SLOTS_PER_EPOCH: 32,
            GENESIS_TIME: 1704067200,
            nptServer: "kr.pool.ntp.org",
            nptInterval: 10000,
        } as unknown as ISetting;
    }
}

export class Validator implements IValidator {
    public keys: string[];

    /**
     * Constructor
     */
    constructor() {
        const defaults = Validator.defaultValue();
        this.keys = defaults.keys;
    }

    public readFromObject(config: IValidator) {
        if (config.keys !== undefined) this.keys = config.keys;
    }

    /**
     * Returns default value
     */
    public static defaultValue(): IValidator {
        return {
            keys: [],
        } as unknown as IValidator;
    }
}

/**
 * The interface of server config
 */
export interface IServerConfig {
    /**
     * The address to which we bind
     */
    address: string;

    /**
     * The port on which we bind
     */
    port: number;
}

/**
 * The interface of database config
 */
export interface IDatabaseConfig {
    /**
     * The host of mysql
     */
    host: string;

    /**
     * The user of mysql
     */
    user: string;

    /**
     * The password of mysql
     */
    password: string;

    /**
     * The database name
     */
    database: string;

    scheme: string;

    /**
     * The host database port
     */
    port: number;

    /**
     * number of milliseconds to wait before timing out when connecting a new client
     * by default this is 0 which means no timeout
     */
    connectionTimeoutMillis: number;

    /**
     * maximum number of clients the pool should contain
     * by default this is set to 10.
     */
    max: number;
}

/**
 * The interface of logging config
 */
export interface ILoggingConfig {
    /**
     * The level of logging
     */
    level: string;
}

export interface IContractsConfig {
    tokenAddress: string;
    ledgerAddress: string;
    providerAddress: string;
    consumerAddress: string;
    exchangerAddress: string;
    phoneLinkerAddress: string;
    shopAddress: string;
    currencyRateAddress: string;
    purchaseAddress: string;
}

/**
 * The interface of Scheduler Item Config
 */
export interface ISchedulerItemConfig {
    /**
     * Name
     */
    name: string;

    /**
     * Whether it's used or not
     */
    enable: boolean;

    /**
     * Execution cycle (seconds)
     */
    expression: string;
}

/**
 * The interface of Scheduler Config
 */
export interface ISchedulerConfig {
    /**
     * Whether the scheduler is used or not
     */
    enable: boolean;

    /**
     * Container for scheduler items
     */
    items: ISchedulerItemConfig[];

    /**
     * Find the scheduler item with your name
     * @param name The name of the scheduler item
     */
    getScheduler(name: string): ISchedulerItemConfig | undefined;
}

export interface ISetting {
    ipfs_gateway_url: string;
    waitedProvide: number;
    nptServer: string;
    nptInterval: number;
    SECONDS_PER_SLOT: number;
    SLOTS_PER_EPOCH: number;
    GENESIS_TIME: bigint;
}

export interface IValidator {
    keys: string[];
}

/**
 * The interface of main config
 */
export interface IConfig {
    server: IServerConfig;

    database: IDatabaseConfig;

    logging: ILoggingConfig;

    scheduler: ISchedulerConfig;

    contracts: IContractsConfig;

    setting: ISetting;

    validator: IValidator;
}
