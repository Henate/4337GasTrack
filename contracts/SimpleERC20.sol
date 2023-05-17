// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

//import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

//import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract ContractGSY is ERC20Capped {
    using SafeERC20 for IERC20;
    event mintMsg(address indexed _sender, address account, uint256 amount);

    constructor(uint256 initialSupply, uint256 tokenCap)
        ERC20("Gastby", "GSY")
        ERC20Capped(tokenCap)
    {
        _mint(msg.sender, initialSupply);
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
        emit mintMsg(msg.sender, account, amount);
    }

    function _safeTransfer(
        address from,
        address to,
        uint256 value
    ) public {
        IERC20(address(this)).safeTransferFrom(from, to, value);
    }
}
