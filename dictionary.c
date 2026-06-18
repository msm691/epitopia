/*
** EPITECH PROJECT, 2026
** duo
** File description:
** Reading the dictionary file and picking a random word.
*/

#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <time.h>
#include "hangman.h"

static long get_file_size(char const *path)
{
    struct stat info;

    if (stat(path, &info) == -1)
        return -1;
    return info.st_size;
}

static char *read_file(char const *path)
{
    int fd = open(path, O_RDONLY);
    long size = get_file_size(path);
    char *buf;

    if (fd == -1)
        return NULL;
    if (size <= 0) {
        close(fd);
        return NULL;
    }
    buf = malloc(size + 1);
    if (buf == NULL || read(fd, buf, size) != size) {
        free(buf);
        close(fd);
        return NULL;
    }
    buf[size] = '\0';
    close(fd);
    return buf;
}

static int count_words(char const *content)
{
    int count = 0;
    int i = 0;

    while (content[i] != '\0') {
        if (content[i] != '\n' && (i == 0 || content[i - 1] == '\n'))
            count++;
        i++;
    }
    return count;
}

static void fill_words(char *content, char **words)
{
    int index = 0;
    int i = 0;

    while (content[i] != '\0') {
        if (content[i] != '\n' && (i == 0 || content[i - 1] == '\0')) {
            words[index] = &content[i];
            index++;
        }
        if (content[i] == '\n')
            content[i] = '\0';
        i++;
    }
}

static int pick_random(int count)
{
    srand(time(NULL));
    return rand() % count;
}

int run_hangman(char const *path, int tries)
{
    char *content = read_file(path);
    char **words;
    int count;
    int status;

    if (content == NULL)
        return ERROR;
    my_lower_string(content);
    count = count_words(content);
    words = (count > 0) ? malloc(sizeof(char *) * count) : NULL;
    if (words == NULL) {
        free(content);
        return ERROR;
    }
    fill_words(content, words);
    status = play_game(words[pick_random(count)], tries);
    free(words);
    free(content);
    return status;
}
