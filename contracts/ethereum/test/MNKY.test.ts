import { expect } from "chai";
import { ethers } from "hardhat";
import { MNKY } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("MNKY Token", function () {
  let mnky: MNKY;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseEther("50000000000"); // 50 billion
  const MAX_SUPPLY = ethers.parseEther("100000000000"); // 100 billion

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const MNKYFactory = await ethers.getContractFactory("MNKY");
    mnky = await MNKYFactory.deploy(owner.address);
    await mnky.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the correct name and symbol", async function () {
      expect(await mnky.name()).to.equal("TokenMonkey");
      expect(await mnky.symbol()).to.equal("MNKY");
    });

    it("should have 18 decimals", async function () {
      expect(await mnky.decimals()).to.equal(18);
    });

    it("should mint initial supply to the owner", async function () {
      expect(await mnky.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    });

    it("should set total supply to initial supply", async function () {
      expect(await mnky.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("should set the correct owner", async function () {
      expect(await mnky.owner()).to.equal(owner.address);
    });

    it("should set MAX_SUPPLY correctly", async function () {
      expect(await mnky.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });
  });

  describe("Minting", function () {
    it("should allow owner to mint tokens", async function () {
      const mintAmount = ethers.parseEther("1000");
      await mnky.mint(addr1.address, mintAmount);
      expect(await mnky.balanceOf(addr1.address)).to.equal(mintAmount);
    });

    it("should update total supply after minting", async function () {
      const mintAmount = ethers.parseEther("1000");
      await mnky.mint(addr1.address, mintAmount);
      expect(await mnky.totalSupply()).to.equal(INITIAL_SUPPLY + mintAmount);
    });

    it("should not allow non-owner to mint", async function () {
      const mintAmount = ethers.parseEther("1000");
      await expect(
        mnky.connect(addr1).mint(addr1.address, mintAmount)
      ).to.be.revertedWithCustomError(mnky, "OwnableUnauthorizedAccount");
    });

    it("should not allow minting beyond max supply", async function () {
      const remainingSupply = MAX_SUPPLY - INITIAL_SUPPLY;
      const excessAmount = remainingSupply + 1n;
      await expect(
        mnky.mint(addr1.address, excessAmount)
      ).to.be.revertedWith("MNKY: mint would exceed max supply");
    });

    it("should allow minting exactly up to max supply", async function () {
      const remainingSupply = MAX_SUPPLY - INITIAL_SUPPLY;
      await mnky.mint(addr1.address, remainingSupply);
      expect(await mnky.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("should not allow any minting once max supply is reached", async function () {
      const remainingSupply = MAX_SUPPLY - INITIAL_SUPPLY;
      await mnky.mint(addr1.address, remainingSupply);
      await expect(
        mnky.mint(addr1.address, 1n)
      ).to.be.revertedWith("MNKY: mint would exceed max supply");
    });
  });

  describe("Burning", function () {
    it("should allow token holder to burn their tokens", async function () {
      const burnAmount = ethers.parseEther("1000");
      await mnky.burn(burnAmount);
      expect(await mnky.balanceOf(owner.address)).to.equal(
        INITIAL_SUPPLY - burnAmount
      );
    });

    it("should reduce total supply after burning", async function () {
      const burnAmount = ethers.parseEther("1000");
      await mnky.burn(burnAmount);
      expect(await mnky.totalSupply()).to.equal(INITIAL_SUPPLY - burnAmount);
    });

    it("should allow burnFrom with approval", async function () {
      const burnAmount = ethers.parseEther("500");
      await mnky.transfer(addr1.address, burnAmount);
      await mnky.connect(addr1).approve(owner.address, burnAmount);
      await mnky.burnFrom(addr1.address, burnAmount);
      expect(await mnky.balanceOf(addr1.address)).to.equal(0);
    });
  });

  describe("Pausing", function () {
    it("should allow owner to pause", async function () {
      await mnky.pause();
      expect(await mnky.paused()).to.be.true;
    });

    it("should allow owner to unpause", async function () {
      await mnky.pause();
      await mnky.unpause();
      expect(await mnky.paused()).to.be.false;
    });

    it("should not allow non-owner to pause", async function () {
      await expect(
        mnky.connect(addr1).pause()
      ).to.be.revertedWithCustomError(mnky, "OwnableUnauthorizedAccount");
    });

    it("should not allow non-owner to unpause", async function () {
      await mnky.pause();
      await expect(
        mnky.connect(addr1).unpause()
      ).to.be.revertedWithCustomError(mnky, "OwnableUnauthorizedAccount");
    });

    it("should block transfers when paused", async function () {
      await mnky.pause();
      await expect(
        mnky.transfer(addr1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(mnky, "EnforcedPause");
    });

    it("should block minting when paused", async function () {
      await mnky.pause();
      await expect(
        mnky.mint(addr1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(mnky, "EnforcedPause");
    });

    it("should allow transfers after unpausing", async function () {
      await mnky.pause();
      await mnky.unpause();
      const amount = ethers.parseEther("100");
      await mnky.transfer(addr1.address, amount);
      expect(await mnky.balanceOf(addr1.address)).to.equal(amount);
    });
  });

  describe("Transfers", function () {
    it("should transfer tokens between accounts", async function () {
      const amount = ethers.parseEther("1000");
      await mnky.transfer(addr1.address, amount);
      expect(await mnky.balanceOf(addr1.address)).to.equal(amount);
      expect(await mnky.balanceOf(owner.address)).to.equal(
        INITIAL_SUPPLY - amount
      );
    });

    it("should fail if sender has insufficient balance", async function () {
      const amount = ethers.parseEther("1");
      await expect(
        mnky.connect(addr1).transfer(owner.address, amount)
      ).to.be.revertedWithCustomError(mnky, "ERC20InsufficientBalance");
    });
  });

  describe("Permit (ERC20Permit)", function () {
    it("should support EIP-2612 permit", async function () {
      const domain = {
        name: "TokenMonkey",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await mnky.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const value = ethers.parseEther("1000");

      const nonce = await mnky.nonces(owner.address);

      const signature = await owner.signTypedData(domain, types, {
        owner: owner.address,
        spender: addr1.address,
        value: value,
        nonce: nonce,
        deadline: deadline,
      });

      const { v, r, s } = ethers.Signature.from(signature);

      await mnky.permit(
        owner.address,
        addr1.address,
        value,
        deadline,
        v,
        r,
        s
      );

      expect(await mnky.allowance(owner.address, addr1.address)).to.equal(
        value
      );
    });
  });
});
