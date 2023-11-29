import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";

import { RelayStorage } from "../src/storage/RelayStorage";
import { TestClient, TestServer } from "./helper/Utility";

import URI from "urijs";
import { URL } from "url";
import { Config } from "../src/common/Config";

import path from "path";

import assert from "assert";
import * as hre from "hardhat";
import { ContractUtils } from "../src/utils/ContractUtils";

describe("Test for ETC", function () {
    this.timeout(1000 * 60 * 5);
    const provider = hre.waffle.provider;
    const [userWallet] = provider.getWallets();

    const client = new TestClient();
    let server: TestServer;
    let storage: RelayStorage;
    let serverURL: URL;
    let config: Config;

    context("Register Mobile", () => {
        before("Create Config", async () => {
            config = new Config();
            config.readFromFile(path.resolve(process.cwd(), "config", "config_test.yaml"));
        });

        before("Create TestServer", async () => {
            serverURL = new URL(`http://127.0.0.1:${config.server.port}`);

            storage = await RelayStorage.make(config.database);
            server = new TestServer(config, storage);
            server = new TestServer(config, storage);
        });

        before("Start TestServer", async () => {
            await server.start();
        });

        after("Stop TestServer", async () => {
            await server.stop();
            await storage.dropTestDB();
        });

        it("Register", async () => {
            const param = {
                account: userWallet.address,
                token: "12345678901234567890123456789012345678901234567890",
                language: "kr",
                os: "iOS",
                signature: "",
            };

            param.signature = await ContractUtils.signMobileToken(userWallet, param.token);

            const response = await client.post(
                URI(serverURL).directory("/v1/mobile").filename("register").toString(),
                param
            );
            assert.deepStrictEqual(response.data.data.account, userWallet.address);
            assert.deepStrictEqual(response.data.data.token, param.token);
            assert.deepStrictEqual(response.data.data.language, param.language);
            assert.deepStrictEqual(response.data.data.os, param.os);
        });
    });
});