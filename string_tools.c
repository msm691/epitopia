/*
** EPITECH PROJECT, 2026
** duo
** File description:
** Small string helpers, used to make the game case insensitive.
*/

#include "hangman.h"

char my_lower_char(char c)
{
    if (c >= 'A' && c <= 'Z')
        return c + ('a' - 'A');
    return c;
}

void my_lower_string(char *str)
{
    int i = 0;

    while (str[i] != '\0') {
        str[i] = my_lower_char(str[i]);
        i++;
    }
}
