// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenMonkey ($MNKY)
 * @dev ERC-20 token with a max supply of 100 billion tokens.
 *      50 billion tokens are minted to the deployer on construction.
 *      The owner can mint additional tokens up to the max supply cap,
 *      and can pause/unpause all transfers.
 */
contract MNKY is ERC20, ERC20Burnable, ERC20Pausable, ERC20Permit, Ownable {
    /// @notice Maximum total supply: 100 billion tokens (with 18 decimals)
    uint256 public constant MAX_SUPPLY = 100_000_000_000 * 10 ** 18;

    /// @notice Initial mint amount: 50 billion tokens (with 18 decimals)
    uint256 private constant INITIAL_SUPPLY = 50_000_000_000 * 10 ** 18;

    /**
     * @dev Deploys the token, minting the initial supply to the deployer.
     * @param initialOwner The address that will own the contract and receive
     *                     the initial token supply.
     */
    constructor(address initialOwner)
        ERC20("TokenMonkey", "MNKY")
        ERC20Permit("TokenMonkey")
        Ownable(initialOwner)
    {
        _mint(initialOwner, INITIAL_SUPPLY);
    }

    /**
     * @notice Mints new tokens to the specified address.
     * @dev Only callable by the owner. Reverts if minting would exceed MAX_SUPPLY.
     * @param to     The recipient of the minted tokens.
     * @param amount The number of tokens to mint (in wei units).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "MNKY: mint would exceed max supply"
        );
        _mint(to, amount);
    }

    /**
     * @notice Pauses all token transfers.
     * @dev Only callable by the owner.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses all token transfers.
     * @dev Only callable by the owner.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Required override for ERC20Pausable. Hooks into every transfer
     *      (including mint and burn) to enforce the pause state.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
}
